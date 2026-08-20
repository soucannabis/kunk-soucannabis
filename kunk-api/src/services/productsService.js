'use strict';

const itemsRepository = require('../repositories/itemsRepository');
const { AppError } = require('../utils/response');
const { query } = require('../db/pool');
const stockService = require('./stockService');
const { getOrSet, memoryCache, cacheTtl, keys } = require('../cache');
const { parseCsvText, escapeCsvCell } = require('../utils/csv');

function invalidateProductsCatalogCache() {
  memoryCache.invalidate(keys.PRODUCTS_CATALOG);
}

const CSV_HEADERS = [
  'sku',
  'name',
  'type',
  'unit',
  'concentration',
  'price',
  'amount',
  'category',
  'batch',
  'status',
];

const ALLOWED_STATUS = new Set(['published', 'draft', 'archived']);

async function updateBatch(id, batch) {
  if (batch === undefined) throw new AppError(400, 'VALIDATION_ERROR', 'batch é obrigatório');
  const row = await itemsRepository.updateItem('products', id, { batch });
  invalidateProductsCatalogCache();
  return row;
}

async function syncBatches(items = []) {
  const updated = [];
  for (const item of items) {
    if (!item.id) continue;
    const row = await itemsRepository.updateItem('products', item.id, { batch: item.batch });
    updated.push(row);
  }
  if (updated.length) invalidateProductsCatalogCache();
  return { updated: updated.length, items: updated };
}

async function listProducts() {
  return getOrSet(keys.PRODUCTS_CATALOG, cacheTtl.PRODUCTS_CATALOG_MS, async () => {
    const result = await query(
      `SELECT id, name, sku, batch, amount, status FROM products ORDER BY id DESC`
    );
    return result.rows;
  });
}

function rowsToCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => escapeCsvCell(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function exportCsv() {
  const result = await query(
    `SELECT sku, name, type, unit, concentration, price, amount, category, batch, status
     FROM products
     ORDER BY id ASC`
  );
  return rowsToCsv(result.rows);
}

function normalizeImportRow(raw) {
  const errors = [];
  const sku = String(raw.sku || '').trim();
  const name = String(raw.name || '').trim();
  if (!sku) errors.push('sku é obrigatório');
  if (!name) errors.push('name é obrigatório');

  let concentration = null;
  if (raw.concentration !== undefined && raw.concentration !== '') {
    const n = Number(String(raw.concentration).replace(',', '.'));
    if (!Number.isFinite(n) || !Number.isInteger(n)) errors.push('concentration deve ser inteiro');
    else concentration = n;
  }

  let price = null;
  if (raw.price !== undefined && raw.price !== '') {
    const n = Number(String(raw.price).replace(',', '.'));
    if (!Number.isFinite(n)) errors.push('price deve ser numérico');
    else price = n;
  } else {
    errors.push('price é obrigatório');
  }

  let amount = 0;
  if (raw.amount !== undefined && raw.amount !== '') {
    const n = Number(String(raw.amount).replace(',', '.'));
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push('amount deve ser inteiro >= 0');
    } else amount = n;
  }

  let status = String(raw.status || 'published').trim().toLowerCase() || 'published';
  if (!ALLOWED_STATUS.has(status)) {
    errors.push(`status inválido (use: ${[...ALLOWED_STATUS].join(', ')})`);
  }

  const payload = {
    sku,
    name,
    type: String(raw.type || '').trim() || null,
    unit: String(raw.unit || '').trim() || null,
    concentration,
    price,
    amount,
    category: String(raw.category || '').trim() || null,
    batch: String(raw.batch || '').trim() || null,
    status,
  };

  return {
    line: raw.__line || null,
    ok: errors.length === 0,
    errors,
    payload,
    action: null,
  };
}

async function annotateExisting(rows) {
  const skus = rows.filter((r) => r.ok && r.payload.sku).map((r) => r.payload.sku);
  const existing = new Map();
  if (skus.length) {
    const res = await query(`SELECT id, sku FROM products WHERE sku = ANY($1::text[])`, [skus]);
    for (const row of res.rows) existing.set(row.sku, row.id);
  }
  return rows.map((r) => {
    if (!r.ok) return { ...r, action: 'skip' };
    const id = existing.get(r.payload.sku);
    return { ...r, action: id ? 'update' : 'create', existing_id: id || null };
  });
}

function coerceRowsInput(body) {
  if (Array.isArray(body?.rows)) {
    return body.rows.map((r, idx) => ({ ...r, __line: r.__line || r.line || idx + 2 }));
  }
  if (typeof body?.csv === 'string') return parseCsvText(body.csv);
  throw new AppError(400, 'VALIDATION_ERROR', 'Informe csv (texto) ou rows (array)');
}

async function validateImport(body) {
  const rawRows = coerceRowsInput(body);
  const normalized = rawRows.map(normalizeImportRow);
  const annotated = await annotateExisting(normalized);
  const valid = annotated.filter((r) => r.ok).length;
  const invalid = annotated.length - valid;
  return {
    headers: CSV_HEADERS,
    total: annotated.length,
    valid,
    invalid,
    rows: annotated,
  };
}

async function importProducts(body) {
  const report = await validateImport(body);
  const toImport = report.rows.filter((r) => r.ok);
  let created = 0;
  let updated = 0;
  const results = [];

  for (const row of toImport) {
    try {
      if (row.action === 'update' && row.existing_id) {
        const data = await itemsRepository.updateItem('products', row.existing_id, {
          ...row.payload,
          date_updated: new Date().toISOString(),
        });
        updated += 1;
        results.push({ line: row.line, ok: true, action: 'update', id: data.id, sku: row.payload.sku });
      } else {
        const data = await itemsRepository.createItem('products', {
          ...row.payload,
          date_created: new Date().toISOString(),
        });
        created += 1;
        results.push({ line: row.line, ok: true, action: 'create', id: data.id, sku: row.payload.sku });
      }
    } catch (err) {
      results.push({
        line: row.line,
        ok: false,
        action: row.action,
        sku: row.payload.sku,
        error: err.message || 'Falha ao gravar',
      });
    }
  }

  const failedRows = report.rows.filter((r) => !r.ok);
  const writeFailed = results.filter((r) => !r.ok);
  const failed = failedRows.length + writeFailed.length;

  if (created + updated > 0) invalidateProductsCatalogCache();

  return {
    created,
    updated,
    failed,
    skipped_invalid: failedRows.length,
    total_input: report.total,
    valid: report.valid,
    success: failed === 0 && report.total > 0 && created + updated === report.total,
    rows: [...failedRows.map((r) => ({
      line: r.line,
      ok: false,
      action: 'skip',
      sku: r.payload?.sku,
      errors: r.errors,
    })), ...results],
  };
}

async function adjustStock(id, body) {
  const result = await stockService.adjustStock(id, body?.delta, { note: body?.note });
  invalidateProductsCatalogCache();
  return result;
}

async function listMovements(id, queryParams = {}) {
  const product = await itemsRepository.getItem('products', id);
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Produto não encontrado');
  const movements = await stockService.listMovements(id, { limit: queryParams.limit });
  return { product: { id: product.id, sku: product.sku, name: product.name, amount: product.amount }, movements };
}

module.exports = {
  CSV_HEADERS,
  updateBatch,
  syncBatches,
  listProducts,
  exportCsv,
  parseCsvText,
  validateImport,
  importProducts,
  adjustStock,
  listMovements,
  normalizeImportRow,
};
