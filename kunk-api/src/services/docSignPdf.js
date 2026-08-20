'use strict';

const crypto = require('crypto');
const PdfPrinter = require('pdfmake');
const { PDFDocument } = require('pdf-lib');
const { VARIABLE_LABELS } = require('./docSignVariables');
const { eventLabel } = require('./docSignEventLabels');

const vfsFonts = require('pdfmake/build/vfs_fonts.js');
const vfs = vfsFonts.pdfMake ? vfsFonts.pdfMake.vfs : vfsFonts;

const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
});

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('base64');
}

function inlineFromMarks(text, marks = []) {
  const node = { text: text == null ? '' : String(text) };
  for (const mark of marks || []) {
    if (mark.type === 'bold') node.bold = true;
    if (mark.type === 'italic') node.italics = true;
    if (mark.type === 'underline') node.decoration = 'underline';
  }
  return node;
}

function inlineNodes(nodes = []) {
  if (!nodes.length) return [{ text: '' }];
  return nodes
    .map((n) => {
      if (n.type === 'text') return inlineFromMarks(n.text, n.marks);
      if (n.type === 'hardBreak') return { text: '\n' };
      if (n.type === 'variable') {
        return { text: `{{${n.attrs?.name || '?'}}}`, color: '#1565c0', bold: true };
      }
      // Signature is always rendered as a footer block — ignore inline nodes.
      if (n.type === 'signature') return null;
      return { text: '' };
    })
    .filter(Boolean);
}

function blockToPdf(node) {
  if (!node) return null;
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level) || 1;
      const sizes = { 1: 18, 2: 15, 3: 13 };
      return {
        text: inlineNodes(node.content || []),
        fontSize: sizes[level] || 12,
        bold: true,
        margin: [0, 8, 0, 6],
      };
    }
    case 'paragraph':
      return {
        text: inlineNodes(node.content || []),
        fontSize: 11,
        margin: [0, 0, 0, 8],
        alignment: node.attrs?.textAlign || 'left',
      };
    case 'bulletList':
      return {
        ul: (node.content || []).map((li) => ({
          text: inlineNodes(li.content?.[0]?.content || li.content || []),
        })),
        margin: [0, 0, 0, 8],
      };
    case 'orderedList':
      return {
        ol: (node.content || []).map((li) => ({
          text: inlineNodes(li.content?.[0]?.content || li.content || []),
        })),
        margin: [0, 0, 0, 8],
      };
    case 'blockquote':
      return {
        stack: (node.content || []).map(blockToPdf).filter(Boolean),
        margin: [12, 4, 0, 8],
        color: '#424242',
      };
    case 'horizontalRule':
      return {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#999' }],
        margin: [0, 8, 0, 8],
      };
    default:
      if (Array.isArray(node.content)) {
        return { stack: node.content.map(blockToPdf).filter(Boolean) };
      }
      return null;
  }
}

function bufferToDataUrl(buffer, mime = 'image/png') {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Bloco fixo no fim do PDF: rótulo "Assinatura:" + linha / imagem / texto ao lado.
 */
function buildSignatureFooter({ signatureDataUrl = null, signatureBuffer = null, typedName = null } = {}) {
  const dataUrl = signatureDataUrl || bufferToDataUrl(signatureBuffer);
  let value;
  if (dataUrl) {
    value = { image: dataUrl, width: 160, margin: [0, 0, 0, 0] };
  } else if (typedName && String(typedName).trim()) {
    value = {
      text: String(typedName).trim(),
      fontSize: 14,
      italics: true,
      margin: [0, 2, 0, 0],
    };
  } else {
    value = {
      text: '____________________',
      margin: [0, 4, 0, 0],
      color: '#666666',
    };
  }

  return {
    unbreakable: true,
    margin: [0, 28, 0, 0],
    columns: [
      {
        width: 'auto',
        text: 'Assinatura:',
        bold: true,
        margin: [0, dataUrl ? 18 : 4, 12, 0],
      },
      {
        width: '*',
        ...value,
      },
    ],
  };
}

function tipTapToDocDefinition(
  contentJson,
  { title = 'Termo', logoDataUrl = null, signatureDataUrl = null, signatureBuffer = null, typedName = null } = {}
) {
  const header = [];
  if (logoDataUrl) {
    header.push({
      image: logoDataUrl,
      width: 180,
      alignment: 'center',
      margin: [0, 0, 0, 12],
    });
  }
  if (title) {
    header.push({
      text: title,
      fontSize: 16,
      bold: true,
      alignment: 'center',
      margin: [0, 0, 0, 16],
    });
  }
  const content = (contentJson?.content || []).map(blockToPdf).filter(Boolean);
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: 'Roboto', fontSize: 11 },
    content: [
      ...header,
      ...(content.length ? content : [{ text: '(documento vazio)' }]),
      buildSignatureFooter({ signatureDataUrl, signatureBuffer, typedName }),
    ],
  };
}

function pdfMakeToBuffer(docDefinition) {
  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

async function renderContentPdf(contentJson, options = {}) {
  const def = tipTapToDocDefinition(contentJson, options);
  const buffer = await pdfMakeToBuffer(def);
  return { buffer, sha256: sha256(buffer) };
}

/** @deprecated Prefer re-rendering via renderContentPdf with signatureBuffer. */
async function stampSignatureOnPdf(pdfBuffer, signaturePngBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];
  const png = await pdfDoc.embedPng(signaturePngBuffer);
  const width = Math.min(180, png.width);
  const height = (png.height / png.width) * width;
  page.drawImage(png, {
    x: 48,
    y: 72,
    width,
    height,
  });
  const out = Buffer.from(await pdfDoc.save());
  return { buffer: out, sha256: sha256(out) };
}

async function renderAuditPdf({
  contractId,
  originalSha256,
  resultSha256,
  generatedAt,
  signerEmail,
  signerName,
  ip,
  userAgent,
  timezone,
  variables,
  events,
}) {
  const varRows = Object.entries(variables || {})
    .filter(([k]) => k !== 'signature')
    .map(([k, v]) => [
      { text: VARIABLE_LABELS[k] || k, bold: true, fontSize: 9 },
      { text: v == null ? '' : String(v), fontSize: 9 },
    ]);

  const eventLines = (events || []).map((e) => {
    const actor = e.actor_name || e.actor_email;
    return {
      text: `${new Date(e.occurred_at).toLocaleString('pt-BR')} — ${eventLabel(e.event_type)}${
        actor ? ` por ${actor}` : ''
      }`,
      fontSize: 9,
      margin: [0, 2, 0, 2],
    };
  });

  const def = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: 'Histórico de auditoria', style: 'h1' },
      { text: `ID do termo: ${contractId}`, margin: [0, 0, 0, 4] },
      { text: `Hash preenchido:\n${originalSha256 || '—'}`, margin: [0, 0, 0, 4] },
      { text: `Hash assinado:\n${resultSha256 || '—'}`, margin: [0, 0, 0, 4] },
      { text: `Gerado em: ${generatedAt}`, margin: [0, 0, 0, 12] },
      { text: signerEmail || '', margin: [0, 0, 0, 2] },
      { text: signerName || '', margin: [0, 0, 0, 2] },
      { text: `IP: ${ip || '—'}`, margin: [0, 0, 0, 2] },
      { text: `Navegador: ${userAgent || '—'}`, margin: [0, 0, 0, 2] },
      { text: `Fuso horário: ${timezone || '—'}`, margin: [0, 0, 0, 12] },
      { text: 'Dados preenchidos', style: 'h2' },
      {
        table: {
          widths: ['40%', '60%'],
          body: varRows.length ? varRows : [[{ text: '—' }, { text: '—' }]],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 12],
      },
      { text: 'Linha do tempo', style: 'h2' },
      ...eventLines,
    ],
    styles: {
      h1: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
      h2: { fontSize: 12, bold: true, margin: [0, 8, 0, 6] },
    },
  };

  const buffer = await pdfMakeToBuffer(def);
  return { buffer, sha256: sha256(buffer) };
}

/** Minimal 1x1 transparent PNG fallback when typing without image render. */
function emptyPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
}

function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[1], 'base64');
}

module.exports = {
  sha256,
  tipTapToDocDefinition,
  renderContentPdf,
  stampSignatureOnPdf,
  buildSignatureFooter,
  renderAuditPdf,
  emptyPngBuffer,
  decodeDataUrl,
  bufferToDataUrl,
};
