'use strict';

const { query } = require('../db/pool');
const { env } = require('../config/env');
const { encrypt, decrypt } = require('../utils/configCrypto');
const { AppError } = require('../utils/response');

function encryptKey() {
  const key = env.configEncryptKey || process.env.CONFIG_ENCRYPT_KEY || '';
  if (!key) {
    throw new AppError(500, 'CONFIG_ERROR', 'CONFIG_ENCRYPT_KEY é obrigatória para credenciais');
  }
  return key;
}

function encryptValue(plaintext) {
  return encrypt(String(plaintext), encryptKey());
}

function decryptValue(encrypted) {
  if (!encrypted) return null;
  return decrypt(String(encrypted), encryptKey());
}

async function listRows(service) {
  const result = await query(
    `SELECT id, service, field_key, encrypted_value, env_fallback, is_secret,
            description, last_tested_at, last_test_ok, date_created, date_updated
     FROM system_api_credentials
     WHERE ($1::text IS NULL OR service = $1)
     ORDER BY service, field_key`,
    [service || null]
  );
  return result.rows;
}

/**
 * Resolve plaintext from an already-fetched row (no extra DB round-trip).
 * Cascade: DB encrypted → env_fallback → null
 */
function resolveFromRow(row) {
  if (!row) return { value: null, source: 'empty', row: null };
  if (row.encrypted_value) {
    try {
      return { value: decryptValue(row.encrypted_value), source: 'db', row };
    } catch {
      throw new AppError(
        500,
        'CREDENTIAL_INVALID',
        `Falha ao descriptografar ${row.service}.${row.field_key}`
      );
    }
  }
  if (row.env_fallback && process.env[row.env_fallback]) {
    return { value: process.env[row.env_fallback], source: 'env', row };
  }
  return { value: null, source: 'empty', row };
}

/** Presence only — avoids PBKDF2 decrypt when plaintext is not needed. */
function hasValueFromRow(row) {
  if (!row) return false;
  if (row.encrypted_value) return true;
  return Boolean(row.env_fallback && process.env[row.env_fallback]);
}

/**
 * Resolve plaintext for a credential field (server-only).
 * Cascade: DB encrypted → env_fallback → null
 */
async function resolveField(service, fieldKey) {
  const result = await query(
    `SELECT id, service, field_key, encrypted_value, env_fallback, is_secret,
            description, last_tested_at, last_test_ok, date_created, date_updated
     FROM system_api_credentials
     WHERE service = $1 AND field_key = $2`,
    [service, fieldKey]
  );
  return resolveFromRow(result.rows[0]);
}

async function resolveAll(service) {
  const rows = await listRows(service);
  const out = {};
  for (const row of rows) {
    out[row.field_key] = resolveFromRow(row).value;
  }
  return out;
}

function toPublicMeta(row, resolved) {
  const hasDb = Boolean(row.encrypted_value);
  const envPresent = Boolean(row.env_fallback && process.env[row.env_fallback]);
  let source = 'empty';
  if (hasDb) source = 'db';
  else if (envPresent) source = 'env';

  const meta = {
    service: row.service,
    field_key: row.field_key,
    is_secret: Boolean(row.is_secret),
    has_value: source !== 'empty',
    source: resolved?.source || source,
    env_fallback: row.env_fallback,
    env_present: envPresent,
    description: row.description,
    last_tested_at: row.last_tested_at,
    last_test_ok: row.last_test_ok,
  };
  // Non-secrets may be shown in admin (redirect_uri, api_base_url, company_id, …)
  if (!meta.is_secret && resolved?.value) {
    meta.value = resolved.value;
  }
  return meta;
}

async function listPublic(service) {
  const rows = await listRows(service);
  return rows.map((row) => {
    // Secrets: presence only — decrypt is expensive (PBKDF2) and unused in admin UI
    if (row.is_secret) {
      const source = row.encrypted_value
        ? 'db'
        : row.env_fallback && process.env[row.env_fallback]
          ? 'env'
          : 'empty';
      return toPublicMeta(row, { source, value: null });
    }
    return toPublicMeta(row, resolveFromRow(row));
  });
}

async function requireFields(service, fieldKeys) {
  const rows = await listRows(service);
  const byKey = Object.fromEntries(rows.map((r) => [r.field_key, r]));
  const missing = [];
  const values = {};
  for (const key of fieldKeys) {
    const resolved = resolveFromRow(byKey[key]);
    if (!resolved.value) missing.push(key);
    else values[key] = resolved.value;
  }
  if (missing.length) {
    throw new AppError(400, 'CREDENTIAL_MISSING', `Credenciais ausentes: ${missing.join(', ')}`, {
      service,
      missing,
    });
  }
  return values;
}

/**
 * Persist credential fields. When run_test is true, caller must pass testFn;
 * values are only committed if testFn resolves ok.
 */
async function putCredentials(service, fields, { runTest = true, testFn = null } = {}) {
  if (!fields || typeof fields !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'fields é obrigatório');
  }

  const rows = await listRows(service);
  const byKey = Object.fromEntries(rows.map((r) => [r.field_key, r]));
  const pending = [];

  for (const [fieldKey, raw] of Object.entries(fields)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const meta = byKey[fieldKey];
    if (!meta) {
      throw new AppError(400, 'VALIDATION_ERROR', `Campo desconhecido: ${fieldKey}`);
    }
    let plaintext = String(raw).trim();
    // Avoid accidental // in paths (common with ngrok host + /api/…)
    if (fieldKey === 'redirect_uri' || fieldKey === 'api_base_url' || fieldKey === 'token_url') {
      plaintext = plaintext.replace(/([^:]\/)\/+/g, '$1');
    }
    if (service === 'melhorenvio' && (fieldKey === 'api_base_url' || fieldKey === 'environment')) {
      const meAuth = require('./melhorenvio/auth');
      if (fieldKey === 'environment') {
        plaintext = meAuth.resolveEnvironmentKey(plaintext);
      } else {
        // Pin to official URL for the chosen / current environment
        const envFromPayload =
          fields.environment != null
            ? meAuth.resolveEnvironmentKey(fields.environment)
            : null;
        const envKey = envFromPayload || meAuth.detectEnvironmentFromApiBase(plaintext);
        plaintext = meAuth.ME_ENVIRONMENTS[envKey].api_base_url;
      }
    }
    pending.push({ fieldKey, plaintext, isSecret: Boolean(meta.is_secret) });
  }

  if (!pending.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Nenhum campo para atualizar');
  }

  if (runTest) {
    if (typeof testFn !== 'function') {
      throw new AppError(400, 'VALIDATION_ERROR', 'run_test exige um teste de conexão');
    }
    // Build merged credentials for the test (pending overrides + existing)
    const merged = await resolveAll(service);
    for (const p of pending) merged[p.fieldKey] = p.plaintext;
    try {
      await testFn(merged);
    } catch (err) {
      const message = err.message || 'Teste de credenciais falhou';
      throw new AppError(400, 'CREDENTIAL_INVALID', message, { service, persisted: false });
    }
  }

  const now = new Date().toISOString();
  for (const p of pending) {
    const encrypted = p.isSecret ? encryptValue(p.plaintext) : encryptValue(p.plaintext);
    await query(
      `UPDATE system_api_credentials
       SET encrypted_value = $1,
           last_tested_at = $2,
           last_test_ok = $3,
           date_updated = $4
       WHERE service = $5 AND field_key = $6`,
      [encrypted, runTest ? now : null, runTest ? true : null, now, service, p.fieldKey]
    );
  }

  return listPublic(service);
}

async function deleteCredential(service, fieldKey) {
  const result = await query(
    `UPDATE system_api_credentials
     SET encrypted_value = NULL, last_tested_at = NULL, last_test_ok = NULL, date_updated = NOW()
     WHERE service = $1 AND field_key = $2
     RETURNING id`,
    [service, fieldKey]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', `Credencial ${service}.${fieldKey} não encontrada`);
  }
  return listPublic(service);
}

async function markTestResult(service, ok, at = new Date().toISOString()) {
  await query(
    `UPDATE system_api_credentials
     SET last_tested_at = $1, last_test_ok = $2, date_updated = $1
     WHERE service = $3`,
    [at, Boolean(ok), service]
  );
}

module.exports = {
  listRows,
  listPublic,
  resolveField,
  resolveFromRow,
  hasValueFromRow,
  resolveAll,
  requireFields,
  putCredentials,
  deleteCredential,
  markTestResult,
  toPublicMeta,
  encryptValue,
  decryptValue,
};
