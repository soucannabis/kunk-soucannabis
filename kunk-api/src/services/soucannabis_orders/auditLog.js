'use strict';

const crypto = require('crypto');
const { query } = require('../../db/pool');

const SNAPSHOT_KEYS = [
  'id',
  'order_code',
  'status',
  'total',
  'items',
  'tracking_code',
  'tracking_code_date',
  'external_delivery_type',
  'payment_date',
  'payment_method',
  'delivery_price',
  'discount',
  'donation',
  'address',
  'associate_name',
  'receiver_name',
  'external_payment_info',
  'soucannabis_order_id',
  'soucannabis_synced_at',
  'soucannabis_sync_error',
  'user_code',
  'details',
  'tags',
];

const SENSITIVE_KEYS = new Set([
  'client_secret',
  'password',
  'access_token',
  'token',
  'authorization',
  'api_key',
  'secret',
]);

function orderSnapshot(order) {
  if (!order || typeof order !== 'object') return null;
  const snap = {};
  for (const key of SNAPSHOT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(order, key)) {
      snap[key] = order[key] ?? null;
    }
  }
  return snap;
}

function stableStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function diffKeys(before, after) {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [];
  for (const key of keys) {
    if (stableStringify(a[key]) !== stableStringify(b[key])) {
      changed.push(key);
    }
  }
  return changed;
}

function sanitizePayload(value, depth = 0) {
  if (value == null || typeof value !== 'object') return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((v) => sanitizePayload(v, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
      out[k] = '[redacted]';
    } else {
      out[k] = sanitizePayload(v, depth + 1);
    }
  }
  return out;
}

function newCorrelationId() {
  return crypto.randomUUID();
}

/**
 * Persist audit row. Fail-soft: never throws to callers of recordSafe.
 */
async function record(entry = {}) {
  const direction = String(entry.direction || '').trim();
  const source = String(entry.source || '').trim();
  const action = String(entry.action || '').trim();
  if (!direction || !source || !action) {
    throw new Error('direction, source e action são obrigatórios');
  }

  const status = String(entry.status || 'ok').trim() || 'ok';
  const before = entry.before_snapshot != null ? orderSnapshot(entry.before_snapshot) || entry.before_snapshot : null;
  const after = entry.after_snapshot != null ? orderSnapshot(entry.after_snapshot) || entry.after_snapshot : null;
  let changedKeys = entry.changed_keys;
  if (changedKeys == null && (before || after)) {
    changedKeys = diffKeys(before || {}, after || {});
  }

  const result = await query(
    `INSERT INTO soucannabis_orders_audit (
       direction, source, action, http_method, http_path, status,
       error_code, error_message, local_order_id, order_code, soucannabis_order_id,
       user_code, correlation_id, request_payload, response_payload,
       before_snapshot, after_snapshot, changed_keys, client_id, date_created
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW()
     ) RETURNING *`,
    [
      direction,
      source,
      action,
      entry.http_method || null,
      entry.http_path || null,
      status,
      entry.error_code || null,
      entry.error_message ? String(entry.error_message).slice(0, 4000) : null,
      entry.local_order_id != null ? Number(entry.local_order_id) : null,
      entry.order_code != null ? String(entry.order_code).slice(0, 64) : null,
      entry.soucannabis_order_id != null ? String(entry.soucannabis_order_id).slice(0, 64) : null,
      entry.user_code != null ? String(entry.user_code) : null,
      entry.correlation_id || null,
      entry.request_payload != null ? JSON.stringify(sanitizePayload(entry.request_payload)) : null,
      entry.response_payload != null ? JSON.stringify(sanitizePayload(entry.response_payload)) : null,
      before != null ? JSON.stringify(before) : null,
      after != null ? JSON.stringify(after) : null,
      changedKeys != null ? JSON.stringify(changedKeys) : null,
      entry.client_id != null ? String(entry.client_id) : null,
    ]
  );
  return result.rows[0];
}

async function recordSafe(entry) {
  try {
    return await record(entry);
  } catch (err) {
    console.error('[soucannabis_orders.auditLog.recordSafe]', err.message || err);
    return null;
  }
}

function clampInt(value, def, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function listAudit(filters = {}) {
  const where = [];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };

  if (filters.from) add('date_created >= ?', new Date(filters.from).toISOString());
  if (filters.to) add('date_created <= ?', new Date(filters.to).toISOString());
  if (filters.order_code) add('order_code = ?', String(filters.order_code));
  if (filters.soucannabis_order_id) {
    add('soucannabis_order_id = ?', String(filters.soucannabis_order_id));
  }
  if (filters.local_order_id != null && filters.local_order_id !== '') {
    add('local_order_id = ?', Number(filters.local_order_id));
  }
  if (filters.direction) add('direction = ?', String(filters.direction));
  if (filters.source) add('source = ?', String(filters.source));
  if (filters.correlation_id) add('correlation_id = ?', String(filters.correlation_id));
  if (filters.status) add('status = ?', String(filters.status));

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = clampInt(filters.limit, 100, 1, 500);
  const offset = clampInt(filters.offset, 0, 0, 1_000_000);

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM soucannabis_orders_audit ${whereSql}`,
    params
  );
  const total = countRes.rows[0]?.total || 0;

  const listParams = [...params, limit, offset];
  const listRes = await query(
    `SELECT * FROM soucannabis_orders_audit ${whereSql}
     ORDER BY date_created DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams
  );

  return {
    total,
    limit,
    offset,
    items: listRes.rows,
  };
}

module.exports = {
  SNAPSHOT_KEYS,
  orderSnapshot,
  diffKeys,
  sanitizePayload,
  newCorrelationId,
  record,
  recordSafe,
  listAudit,
};
