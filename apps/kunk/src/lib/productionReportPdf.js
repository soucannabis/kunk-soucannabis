import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

function itemQuantity(item) {
  return Number(item?.quantity ?? item?.qnt ?? 1) || 0;
}

function itemName(item) {
  const name = String(item?.name || item?.product_name || item?.code || 'Produto').trim();
  const code = String(item?.code || item?.sku || '').trim();
  const batches = [item?.batch, item?.lot, item?.lot_number, item?.batches]
    .flat()
    .filter(Boolean)
    .join(', ');
  return `${name}${code && code !== name ? ` - ${code}` : ''}${batches ? ` (${batches})` : ''}`;
}

function orderName(order) {
  const name = order?.receiver_name || order?.associate_name || order?.name_associate || '—';
  const tags = Array.isArray(order?.tags)
    ? order.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.tag)).filter(Boolean)
    : [];
  return tags.some((tag) => String(tag).toLowerCase() === 'correio') ? `${name} (correio)` : name;
}

/** Nº do pedido no relatório: id numérico da UI (não o UUID order_code). */
function orderNumber(order) {
  return order?.id != null && order.id !== '' ? String(order.id) : '';
}

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

function reportTimestamp() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function productionReportFilename() {
  return `itens_producao_${reportTimestamp().replace(/\D/g, '_')}.pdf`;
}

function buildBasePdf(orders) {
  const products = new Map();
  const dispensationRows = [];

  orders.forEach((order, orderIndex) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      const name = itemName(item);
      products.set(name, (products.get(name) || 0) + itemQuantity(item));
    });

    if (!items.length) {
      dispensationRows.push([
        String(orderIndex + 1),
        orderNumber(order),
        orderName(order),
        '',
        '',
        dateLabel(order.date_created || order.created_date),
        '',
      ]);
    }

    items.forEach((item, itemIndex) => {
      dispensationRows.push([
        itemIndex === 0 ? String(orderIndex + 1) : '',
        itemIndex === 0 ? orderNumber(order) : '',
        itemIndex === 0 ? orderName(order) : '',
        item.code || item.sku || '',
        itemQuantity(item),
        itemIndex === 0 ? dateLabel(order.date_created || order.created_date) : '',
        [item.batch, item.lot, item.lot_number, item.batches].flat().filter(Boolean).join(', '),
      ]);
    });

    const info = order.details || order.info || order.order_notes;
    if (info) {
      dispensationRows.push([
        {
          content: `Informações: ${String(info).trim()}`,
          colSpan: 7,
          styles: { halign: 'left', fontStyle: 'italic', fillColor: [248, 248, 248] },
        },
      ]);
    }
  });

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Itens para Produção', 14, 14);
  doc.setFontSize(10);
  doc.text(`Data: ${reportTimestamp()}h`, 14, 22);
  autoTable(doc, {
    head: [['Produto', 'Quantidade']],
    body: [...products].map(([name, quantity]) => [name, quantity]),
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 10 },
  });

  doc.addPage();
  doc.setFontSize(16);
  doc.text('Registro de dispensação', doc.internal.pageSize.getWidth() / 2, 14, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Nº de pedidos: ${orders.length}`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
  autoTable(doc, {
    head: [['Item', 'Nº do Pedido', 'Nome para entrega', 'Código do produto', 'Qtde', 'Data de criação', 'Lote dispensado']],
    body: dispensationRows,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 23 }, 2: { cellWidth: 36 }, 3: { cellWidth: 39 }, 4: { cellWidth: 13 }, 5: { cellWidth: 27 }, 6: { cellWidth: 32 } },
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = doc.lastAutoTable?.finalY || 30;
  const y = Math.min(finalY + 8, pageHeight - 35);
  doc.text('Observações:', 14, y);
  doc.rect(14, y + 3, pageWidth - 28, Math.max(20, pageHeight - y - 17));
  return doc;
}

async function prescriptionForOrder(api, order) {
  if (!order.user_code) return { order, prescription: null };
  const userResponse = await api.getUserByCode(order.user_code);
  const user = userResponse.data || null;
  const prescription = user?.prescription;
  if (!prescription) return { order, prescription: null };
  const fileResponse = await api.getFile(prescription);
  const file = fileResponse.data || null;
  if (!file?.id) return { order, prescription: null };
  const blob = api.fileDownload
    ? await api.fileDownload(file.id)
    : await (async () => {
        const response = await fetch(api.fileDownloadUrl(file.id), { credentials: 'include' });
        if (!response.ok) throw new Error(`Não foi possível baixar a receita (${response.status})`);
        return response.blob();
      })();
  return {
    order,
    prescription: {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: file.mime_type || file.type || blob.type || '',
      name: file.filename || file.name || '',
    },
  };
}

function isPdf(file) {
  return String(file?.mime || '').includes('pdf') || String(file?.name || '').toLowerCase().endsWith('.pdf');
}

function imageKind(file) {
  const value = `${file?.mime || ''} ${file?.name || ''}`.toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('jpg') || value.includes('jpeg')) return 'jpg';
  return null;
}

export async function exportProductionReport(api, orders, onProgress) {
  const processed = [];
  const skipped = [];
  for (const order of orders) {
    onProgress?.(order.id, 'Processando receita…');
    try {
      processed.push(await prescriptionForOrder(api, order));
      onProgress?.(order.id, 'Pronto');
    } catch (error) {
      processed.push({ order, prescription: null });
      skipped.push({ order, message: error.message || 'Receita indisponível' });
      onProgress?.(order.id, 'Receita ignorada');
    }
  }

  const base = buildBasePdf(orders);
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.load(base.output('arraybuffer'));
  for (const { order, prescription } of processed) {
    if (!prescription?.bytes) continue;
    try {
      if (isPdf(prescription)) {
        const source = await PDFDocument.load(prescription.bytes);
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => output.addPage(page));
        continue;
      }
      const kind = imageKind(prescription);
      if (!kind) throw new Error('Formato de receita não suportado');
      const image = kind === 'png'
        ? await output.embedPng(prescription.bytes)
        : await output.embedJpg(prescription.bytes);
      const page = output.addPage([595.28, 841.89]);
      page.drawText(`Receita — ${orderName(order)} — Pedido ${orderNumber(order)}`, {
        x: 36, y: 805, size: 12,
      });
      const scale = Math.min(523 / image.width, 735 / image.height);
      page.drawImage(image, {
        x: (595.28 - image.width * scale) / 2,
        y: 35,
        width: image.width * scale,
        height: image.height * scale,
      });
    } catch (error) {
      skipped.push({ order, message: error.message || 'Não foi possível incluir a receita' });
    }
  }

  const bytes = await output.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  return { skipped, pdfUrl: url, filename: productionReportFilename() };
}

/** Abre o PDF gerado (nova aba no uso normal; mesma aba na demo gravada). */
export function openProductionReportPdf(pdfUrl, filename = productionReportFilename()) {
  if (!pdfUrl) return;
  if (window.__KUNK_DEMO_OPEN_PDF_SAME_TAB) {
    window.location.assign(pdfUrl);
    return;
  }
  window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  const anchor = document.createElement('a');
  anchor.href = pdfUrl;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
}
