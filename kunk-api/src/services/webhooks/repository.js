'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, withClient } = require('../../db/pool');
const { env } = require('../../config/env');
const { encrypt, decrypt } = require('../../utils/configCrypto');
const { AppError } = require('../../utils/response');
const { assertPublicHttpUrl } = require('../../utils/publicHttpUrl');
const {
  WEBHOOK_TABLES,
  WEBHOOK_ACTIONS,
  DEFAULT_MAX_ATTEMPTS,
  isWebhookTable,
  isWebhookAction,
} = require('./catalog');

function encryptKey() {
  const key = env.configEncryptKey || process.env.CONFIG_ENCRYPT_KEY || '';
  if (!key) {
    throw new AppError(500, 'CONFIG_ERROR', 'CONFIG_ENCRYPT_KEY é obrigatória para webhooks');
  }
  return key;
}

function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

function encryptSecret(plaintext) {
  return encrypt(String(plaintext), encryptKey());
}

function decryptSecret(encrypted) {
  return decrypt(String(encrypted), encryptKey());
}

function secretPrefix(plaintext) {
  return String(plaintext || '').slice(0, 8);
}

function assertHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL inválida');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'URL deve usar http ou https');
  }
  return parsed.toString();
}

async function assertWebhookUrl(url) {
  return assertPublicHttpUrl(url);
}

function normalizeTables(tables) {
  const list = Array.isArray(tables) ? tables.map(String) : [];
  const unique = [...new Set(list)];
  if (!unique.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Selecione ao menos uma tabela');
  }
  for (const t of unique) {
    if (!isWebhookTable(t)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Tabela não suportada: ${t}`);
    }
  }
  return unique;
}

function normalizeActions(actions) {
  const list = Array.isArray(actions) ? actions.map(String) : [];
  const unique = [...new Set(list)];
  if (!unique.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Selecione ao menos uma ação');
  }
  for (const a of unique) {
    if (!isWebhookAction(a)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Ação não suportada: ${a}`);
    }
  }
  return unique;
}

function toPublicEndpoint(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    secret_prefix: row.secret_prefix,
    tables: row.tables || [],
    actions: row.actions || [],
    enabled: Boolean(row.enabled),
    date_created: row.date_created,
    date_updated: row.date_updated,
  };
}

async function listEndpoints() {
  const result = await query(
    `SELECT id, name, url, secret_prefix, tables, actions, enabled, date_created, date_updated
     FROM webhook_endpoints
     ORDER BY id DESC`
  );
  return result.rows.map(toPublicEndpoint);
}

async function getEndpoint(id) {
  const result = await query(
    `SELECT id, name, url, secret_encrypted, secret_prefix, tables, actions, enabled, date_created, date_updated
     FROM webhook_endpoints WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createEndpoint({ name, url, tables, actions, enabled = true }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new AppError(400, 'VALIDATION_ERROR', 'Nome é obrigatório');
  const normalizedUrl = await assertWebhookUrl(url);
  const normalizedTables = normalizeTables(tables);
  const normalizedActions = normalizeActions(actions);
  const secret = generateSecret();
  const result = await query(
    `INSERT INTO webhook_endpoints (
       name, url, secret_encrypted, secret_prefix, tables, actions, enabled, date_created
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [
      trimmedName,
      normalizedUrl,
      encryptSecret(secret),
      secretPrefix(secret),
      normalizedTables,
      normalizedActions,
      Boolean(enabled),
    ]
  );
  return { endpoint: toPublicEndpoint(result.rows[0]), secret };
}

async function updateEndpoint(id, patch = {}) {
  const existing = await getEndpoint(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Webhook não encontrado');

  const next = {
    name: patch.name != null ? String(patch.name).trim() : existing.name,
    url: patch.url != null ? await assertWebhookUrl(patch.url) : existing.url,
    tables: patch.tables != null ? normalizeTables(patch.tables) : existing.tables,
    actions: patch.actions != null ? normalizeActions(patch.actions) : existing.actions,
    enabled: patch.enabled != null ? Boolean(patch.enabled) : existing.enabled,
  };
  if (!next.name) throw new AppError(400, 'VALIDATION_ERROR', 'Nome é obrigatório');

  const result = await query(
    `UPDATE webhook_endpoints
     SET name = $1, url = $2, tables = $3, actions = $4, enabled = $5, date_updated = NOW()
     WHERE id = $6
     RETURNING *`,
    [next.name, next.url, next.tables, next.actions, next.enabled, id]
  );
  return toPublicEndpoint(result.rows[0]);
}

async function rotateSecret(id) {
  const existing = await getEndpoint(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Webhook não encontrado');
  const secret = generateSecret();
  const result = await query(
    `UPDATE webhook_endpoints
     SET secret_encrypted = $1, secret_prefix = $2, date_updated = NOW()
     WHERE id = $3
     RETURNING *`,
    [encryptSecret(secret), secretPrefix(secret), id]
  );
  return { endpoint: toPublicEndpoint(result.rows[0]), secret };
}

async function deleteEndpoint(id) {
  const result = await query(`DELETE FROM webhook_endpoints WHERE id = $1 RETURNING id`, [id]);
  if (!result.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Webhook não encontrado');
  return { id: result.rows[0].id };
}

async function listMatchingEndpoints(table, action) {
  if (!isWebhookTable(table) || !isWebhookAction(action)) return [];
  const result = await query(
    `SELECT id, name, url, secret_encrypted, secret_prefix, tables, actions, enabled
     FROM webhook_endpoints
     WHERE enabled = TRUE
       AND $1 = ANY(tables)
       AND $2 = ANY(actions)`,
    [table, action]
  );
  return result.rows;
}

async function enqueueDeliveries(rows) {
  if (!rows?.length) return [];
  const inserted = [];
  for (const row of rows) {
    const result = await query(
      `INSERT INTO webhook_deliveries (
         endpoint_id, event_id, table_name, action, record_id, payload,
         status, attempts, max_attempts, next_attempt_at, date_created
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending', 0, $7, NOW(), NOW())
       RETURNING *`,
      [
        row.endpoint_id,
        row.event_id,
        row.table_name,
        row.action,
        row.record_id != null ? String(row.record_id) : null,
        JSON.stringify(row.payload),
        row.max_attempts || DEFAULT_MAX_ATTEMPTS,
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function enqueueTestDelivery(endpointId) {
  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) throw new AppError(404, 'NOT_FOUND', 'Webhook não encontrado');
  const eventId = uuidv4();
  const payload = {
    id: `evt_${eventId}`,
    table: 'ping',
    action: 'test',
    record_id: null,
    occurred_at: new Date().toISOString(),
    data: { ok: true, message: 'Kunk webhook test' },
  };
  const rows = await enqueueDeliveries([
    {
      endpoint_id: endpointId,
      event_id: eventId,
      table_name: 'ping',
      action: 'test',
      record_id: null,
      payload,
    },
  ]);
  return rows[0];
}

async function listDeliveries(endpointId, { limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const result = await query(
    `SELECT id, endpoint_id, event_id, table_name, action, record_id, status,
            attempts, max_attempts, next_attempt_at, last_http_status, last_error,
            date_created, date_delivered
     FROM webhook_deliveries
     WHERE endpoint_id = $1
     ORDER BY date_created DESC
     LIMIT $2 OFFSET $3`,
    [endpointId, lim, off]
  );
  return result.rows;
}

/**
 * Claim due pending/failed deliveries for processing.
 */
async function claimDueDeliveries(limit = 20) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const due = await client.query(
        `SELECT d.id
         FROM webhook_deliveries d
         JOIN webhook_endpoints e ON e.id = d.endpoint_id
         WHERE d.status IN ('pending', 'failed')
           AND d.next_attempt_at <= NOW()
           AND d.attempts < d.max_attempts
           AND e.enabled = TRUE
         ORDER BY d.next_attempt_at ASC
         LIMIT $1
         FOR UPDATE OF d SKIP LOCKED`,
        [limit]
      );
      if (!due.rows.length) {
        await client.query('COMMIT');
        return [];
      }
      const ids = due.rows.map((r) => r.id);
      const claimed = await client.query(
        `UPDATE webhook_deliveries
         SET status = 'processing'
         WHERE id = ANY($1::bigint[])
         RETURNING *`,
        [ids]
      );
      await client.query('COMMIT');
      return claimed.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

async function getEndpointSecret(endpointId) {
  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) return null;
  return {
    endpoint: toPublicEndpoint(endpoint),
    secret: decryptSecret(endpoint.secret_encrypted),
    url: endpoint.url,
  };
}

function computeNextAttemptAt(attempts) {
  const seconds = Math.min(3600, Math.pow(2, Math.max(0, attempts)) * 15);
  return new Date(Date.now() + seconds * 1000);
}

async function markDelivered(id, httpStatus) {
  const result = await query(
    `UPDATE webhook_deliveries
     SET status = 'delivered',
         attempts = attempts + 1,
         last_http_status = $2,
         last_error = NULL,
         date_delivered = NOW(),
         next_attempt_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, httpStatus]
  );
  return result.rows[0];
}

async function markRetryOrDead(id, { httpStatus, error, attempts, maxAttempts }) {
  const nextAttempts = Number(attempts) + 1;
  const dead = nextAttempts >= Number(maxAttempts);
  const nextAt = dead ? new Date() : computeNextAttemptAt(nextAttempts);
  const result = await query(
    `UPDATE webhook_deliveries
     SET status = $2,
         attempts = $3,
         last_http_status = $4,
         last_error = $5,
         next_attempt_at = $6
     WHERE id = $1
     RETURNING *`,
    [id, dead ? 'dead' : 'failed', nextAttempts, httpStatus ?? null, String(error || '').slice(0, 2000), nextAt]
  );
  return result.rows[0];
}

module.exports = {
  WEBHOOK_TABLES,
  WEBHOOK_ACTIONS,
  generateSecret,
  encryptSecret,
  decryptSecret,
  assertHttpUrl,
  assertWebhookUrl,
  normalizeTables,
  normalizeActions,
  toPublicEndpoint,
  listEndpoints,
  getEndpoint,
  createEndpoint,
  updateEndpoint,
  rotateSecret,
  deleteEndpoint,
  listMatchingEndpoints,
  enqueueDeliveries,
  enqueueTestDelivery,
  listDeliveries,
  claimDueDeliveries,
  getEndpointSecret,
  computeNextAttemptAt,
  markDelivered,
  markRetryOrDead,
};
