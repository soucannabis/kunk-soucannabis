'use strict';

const { withClient } = require('../db/pool');
const { AppError } = require('../utils/response');

const KIND_SALE = 'sale';
const KIND_SALE_REVERSAL = 'sale_reversal';
const KIND_ADJUSTMENT = 'adjustment';

async function withTransaction(fn) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

function parseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function lineSku(item) {
  return String(item?.code || item?.sku || '').trim();
}

function lineQty(item) {
  const q = Number(item?.quantity ?? item?.qnt ?? item?.qty);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.trunc(q);
}

/**
 * Agrupa quantidades por produto resolvido (product_id ou sku/code).
 * @returns {Promise<Array<{ productId: number, sku: string, quantity: number }>>}
 */
async function resolveDebitLines(client, items) {
  const aggregated = new Map();

  for (const item of parseItems(items)) {
    const quantity = lineQty(item);
    if (quantity <= 0) continue;

    let productId = item?.product_id != null ? Number(item.product_id) : null;
    let sku = lineSku(item);
    let row = null;

    if (Number.isFinite(productId) && productId > 0) {
      const res = await client.query(
        `SELECT id, sku, COALESCE(amount, 0)::int AS amount FROM products WHERE id = $1 FOR UPDATE`,
        [productId]
      );
      row = res.rows[0] || null;
    }

    if (!row && sku) {
      const res = await client.query(
        `SELECT id, sku, COALESCE(amount, 0)::int AS amount FROM products WHERE sku = $1 FOR UPDATE`,
        [sku]
      );
      row = res.rows[0] || null;
    }

    if (!row) {
      throw new AppError(
        400,
        'PRODUCT_NOT_FOUND',
        `Produto não encontrado para o item do pedido (sku/code=${sku || '—'}, product_id=${productId || '—'})`,
        { sku: sku || null, product_id: productId || null }
      );
    }

    productId = row.id;
    sku = row.sku || sku;
    const prev = aggregated.get(productId) || { productId, sku, quantity: 0, available: row.amount };
    prev.quantity += quantity;
    prev.available = row.amount;
    aggregated.set(productId, prev);
  }

  return [...aggregated.values()];
}

async function lockOrder(client, orderId) {
  const res = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  const order = res.rows[0];
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
  return order;
}

async function applySaleForOrder(orderId, externalClient = null) {
  const run = async (client) => {
    const order = await lockOrder(client, orderId);
    if (order.stock_debited_at) {
      return { applied: false, reason: 'already_debited', order };
    }

    const lines = await resolveDebitLines(client, order.items);
    // Pedidos com estoque 0/insuficiente são permitidos — estoque pode ficar negativo.

    const now = new Date().toISOString();
    for (const line of lines) {
      await client.query(
        `UPDATE products SET amount = COALESCE(amount, 0) - $1, date_updated = $2 WHERE id = $3`,
        [line.quantity, now, line.productId]
      );
      await client.query(
        `INSERT INTO product_stock_movements (product_id, order_id, quantity, kind, note, date_created)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          line.productId,
          orderId,
          -line.quantity,
          KIND_SALE,
          line.available < line.quantity
            ? `Venda pedido #${orderId} (estoque insuficiente: ${line.available})`
            : `Venda pedido #${orderId}`,
          now,
        ]
      );
    }

    const updated = await client.query(
      `UPDATE orders SET stock_debited_at = $1, date_updated = $1 WHERE id = $2 RETURNING *`,
      [now, orderId]
    );
    return { applied: true, reason: 'debited', order: updated.rows[0], lines };
  };

  if (externalClient) return run(externalClient);
  return withTransaction(run);
}

async function reverseSaleForOrder(orderId, externalClient = null) {
  const run = async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order.stock_debited_at) {
      return { reversed: false, reason: 'not_debited', order };
    }

    const sales = await client.query(
      `SELECT id, product_id, quantity FROM product_stock_movements
       WHERE order_id = $1 AND kind = $2 AND date_created >= $3
       ORDER BY id ASC`,
      [orderId, KIND_SALE, order.stock_debited_at]
    );

    const now = new Date().toISOString();
    for (const mov of sales.rows) {
      const qty = Math.abs(Number(mov.quantity) || 0);
      if (qty <= 0) continue;
      await client.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [mov.product_id]);
      await client.query(
        `UPDATE products SET amount = COALESCE(amount, 0) + $1, date_updated = $2 WHERE id = $3`,
        [qty, now, mov.product_id]
      );
      await client.query(
        `INSERT INTO product_stock_movements (product_id, order_id, quantity, kind, note, date_created)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mov.product_id, orderId, qty, KIND_SALE_REVERSAL, `Estorno pedido #${orderId}`, now]
      );
    }

    const updated = await client.query(
      `UPDATE orders SET stock_debited_at = NULL, date_updated = $1 WHERE id = $2 RETURNING *`,
      [now, orderId]
    );
    return { reversed: true, reason: 'restored', order: updated.rows[0] };
  };

  if (externalClient) return run(externalClient);
  return withTransaction(run);
}

async function adjustStock(productId, delta, { note } = {}) {
  const d = Math.trunc(Number(delta));
  if (!Number.isFinite(d) || d === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'delta deve ser um inteiro diferente de zero');
  }

  return withTransaction(async (client) => {
    const res = await client.query(
      `SELECT id, sku, COALESCE(amount, 0)::int AS amount FROM products WHERE id = $1 FOR UPDATE`,
      [productId]
    );
    const product = res.rows[0];
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Produto não encontrado');

    const next = product.amount + d;
    if (next < 0) {
      throw new AppError(
        400,
        'INSUFFICIENT_STOCK',
        `Ajuste resultaria em estoque negativo (atual=${product.amount}, delta=${d})`
      );
    }

    const now = new Date().toISOString();
    await client.query(`UPDATE products SET amount = $1, date_updated = $2 WHERE id = $3`, [
      next,
      now,
      productId,
    ]);
    await client.query(
      `INSERT INTO product_stock_movements (product_id, order_id, quantity, kind, note, date_created)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [productId, d, KIND_ADJUSTMENT, note || 'Ajuste manual de estoque', now]
    );

    const updated = await client.query(`SELECT * FROM products WHERE id = $1`, [productId]);
    return updated.rows[0];
  });
}

async function listMovements(productId, { limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const res = await withClient((client) =>
    client.query(
      `SELECT m.*, o.order_code, o.status AS order_status
       FROM product_stock_movements m
       LEFT JOIN orders o ON o.id = m.order_id
       WHERE m.product_id = $1
       ORDER BY m.date_created DESC, m.id DESC
       LIMIT $2`,
      [productId, lim]
    )
  );
  return res.rows;
}

async function resolveProductRow(client, item, fields = 'id, COALESCE(amount, 0)::int AS amount, batch') {
  const productId = item?.product_id != null ? Number(item.product_id) : null;
  const sku = lineSku(item);

  if (Number.isFinite(productId) && productId > 0) {
    const res = await client.query(`SELECT ${fields} FROM products WHERE id = $1`, [productId]);
    if (res.rows[0]) return res.rows[0];
  }
  if (sku) {
    const res = await client.query(`SELECT ${fields} FROM products WHERE sku = $1`, [sku]);
    if (res.rows[0]) return res.rows[0];
  }
  return null;
}

/**
 * Anexa stock_at_order (e batch do produto, se houver) em cada item resolvido.
 */
async function snapshotItemsStock(items) {
  const list = parseItems(items);
  if (!list.length) return { items: list, has_zero_stock: false };

  return withClient(async (client) => {
    const enriched = [];
    let hasZero = false;
    for (const item of list) {
      const row = await resolveProductRow(client, item);

      if (row) {
        const stock = row.amount;
        if (stock <= 0) hasZero = true;
        const productBatch = String(row.batch || '').trim();
        const existingBatch = String(item.batch || '').trim();
        enriched.push({
          ...item,
          product_id: item.product_id || row.id,
          stock_at_order: stock,
          ...(productBatch || existingBatch
            ? { batch: productBatch || existingBatch }
            : null),
        });
      } else {
        enriched.push({ ...item, stock_at_order: item.stock_at_order ?? null });
      }
    }
    return { items: enriched, has_zero_stock: hasZero };
  });
}

/**
 * Grava o lote vigente do produto nos itens do pedido (fallback legado sem SCP/FIFO).
 * Preferência: products.batch atual; mantém item.batch se o produto não tiver lote.
 * @param {object} client - client pg (transação)
 * @param {unknown} items
 * @returns {Promise<{ items: object[], changed: boolean }>}
 */
async function stampItemsBatch(client, items) {
  const list = parseItems(items);
  if (!list.length) return { items: list, changed: false };

  let changed = false;
  const enriched = [];
  for (const item of list) {
    const row = await resolveProductRow(client, item, 'id, batch');
    if (!row) {
      enriched.push(item);
      continue;
    }

    const productBatch = String(row.batch || '').trim();
    const currentBatch = String(item?.batch || '').trim();
    const nextBatch = productBatch || currentBatch || null;
    const next = {
      ...item,
      product_id: item.product_id || row.id,
      ...(nextBatch ? { batch: nextBatch } : { batch: item.batch ?? null }),
    };
    if (String(next.batch || '').trim() !== currentBatch) changed = true;
    enriched.push(next);
  }
  return { items: enriched, changed };
}

module.exports = {
  KIND_SALE,
  KIND_SALE_REVERSAL,
  KIND_ADJUSTMENT,
  withTransaction,
  applySaleForOrder,
  reverseSaleForOrder,
  adjustStock,
  listMovements,
  resolveDebitLines,
  parseItems,
  snapshotItemsStock,
  stampItemsBatch,
};
