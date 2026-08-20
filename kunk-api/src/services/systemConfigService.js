'use strict';

const { query } = require('../db/pool');
const { env } = require('../config/env');
const { encrypt, decrypt } = require('../utils/configCrypto');
const { AppError } = require('../utils/response');

function isFilled(value) {
  return value !== undefined && value !== null && String(value).length > 0;
}

function readLocalEnv(key) {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw);
}

/**
 * Resolve a single config row: DB value → process.env → hardcoded_default.
 */
function resolveRow(row) {
  const key = row.key;
  let value = null;
  let source = 'empty';
  let error = null;

  if (isFilled(row.value)) {
    try {
      if (row.is_sensitive) {
        const encryptKey = env.configEncryptKey || process.env.CONFIG_ENCRYPT_KEY || '';
        if (!encryptKey) {
          error = `CONFIG_ENCRYPT_KEY ausente para descriptografar ${key}`;
        } else {
          value = decrypt(String(row.value), encryptKey);
          source = 'db';
        }
      } else {
        value = String(row.value);
        source = 'db';
      }
    } catch (err) {
      error = `Falha ao ler config ${key}: ${err.message}`;
    }
  }

  if (value === null && !error) {
    const fromEnv = readLocalEnv(key);
    if (fromEnv !== null) {
      value = fromEnv;
      source = 'env';
    }
  }

  if (value === null && !error) {
    if (row.allow_hardcoded) {
      value = row.hardcoded_default == null ? '' : String(row.hardcoded_default);
      source = 'hardcoded';
    } else {
      value = '';
      source = 'empty';
    }
  }

  if (row.is_required && !isFilled(value)) {
    error = error || `Config obrigatória ausente: ${row.system}.${key}`;
  }

  return {
    key,
    value: value == null ? '' : value,
    source,
    error,
    is_sensitive: Boolean(row.is_sensitive),
    is_required: Boolean(row.is_required),
    value_type: row.value_type || 'string',
    description: row.description || null,
  };
}

function toAdminItem(row, resolved) {
  const hasDbValue = isFilled(row.value);
  const item = {
    id: row.id,
    system: row.system,
    key: row.key,
    value_type: row.value_type || 'string',
    is_sensitive: Boolean(row.is_sensitive),
    is_required: Boolean(row.is_required),
    allow_hardcoded: Boolean(row.allow_hardcoded),
    hardcoded_default: row.hardcoded_default,
    description: row.description || null,
    source: resolved.source,
    has_value: hasDbValue,
    error: resolved.error,
  };

  if (row.is_sensitive) {
    item.value = null;
    item.resolved_value = null;
    if (hasDbValue) {
      item.value = '********';
    }
  } else {
    item.value = hasDbValue ? String(row.value) : null;
    item.resolved_value = resolved.value;
  }

  return item;
}

async function listBySystem(system) {
  const result = await query(
    `SELECT id, system, key, value, value_type, is_sensitive, is_required,
            allow_hardcoded, hardcoded_default, description
     FROM system_configs
     WHERE system = $1
     ORDER BY key ASC`,
    [system],
  );
  return result.rows;
}

async function listSystems() {
  const result = await query(
    `SELECT system, COUNT(*)::int AS key_count
     FROM system_configs
     GROUP BY system
     ORDER BY system ASC`
  );
  return result.rows;
}

async function getById(id) {
  const result = await query(
    `SELECT id, system, key, value, value_type, is_sensitive, is_required,
            allow_hardcoded, hardcoded_default, description
     FROM system_configs WHERE id = $1`,
    [id]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Config não encontrada');
  }
  return result.rows[0];
}

async function resolveAll(system) {
  const rows = await listBySystem(system);
  const items = rows.map(resolveRow);
  const values = {};
  const errors = [];
  for (const item of items) {
    values[item.key] = item.value;
    if (item.error) errors.push(item.error);
  }
  return { values, items, errors };
}

async function resolvePublic(system) {
  const { items, errors } = await resolveAll(system);
  const values = {};
  for (const item of items) {
    if (item.is_sensitive) continue;
    // Inclui db, env e hardcoded — senão o front fica só com Vite bootstrap
    // e ignora defaults/valores do Admin em system_configs.
    if (item.source === 'db' || item.source === 'env' || item.source === 'hardcoded') {
      values[item.key] = item.value;
    }
  }
  return { system, values, errors };
}

async function listAdminBySystem(system) {
  const rows = await listBySystem(system);
  return rows.map((row) => toAdminItem(row, resolveRow(row)));
}

async function getAdminById(id) {
  const row = await getById(id);
  return toAdminItem(row, resolveRow(row));
}

function encryptForStorage(plaintext) {
  const key = env.configEncryptKey || process.env.CONFIG_ENCRYPT_KEY || '';
  if (!key) {
    throw new AppError(500, 'CONFIG_ERROR', 'CONFIG_ENCRYPT_KEY é obrigatória para gravar configs sensíveis');
  }
  return encrypt(String(plaintext), key);
}

async function createConfig(payload) {
  const system = String(payload.system || '').trim();
  const key = String(payload.key || '').trim();
  if (!system || !key) {
    throw new AppError(400, 'VALIDATION_ERROR', 'system e key são obrigatórios');
  }

  const isSensitive = Boolean(payload.is_sensitive);
  let value = payload.value;
  if (value !== undefined && value !== null && value !== '' && isSensitive) {
    value = encryptForStorage(value);
  } else if (value === undefined || value === '') {
    value = null;
  } else {
    value = String(value);
  }

  const result = await query(
    `INSERT INTO system_configs (
       system, key, value, value_type, is_sensitive, is_required,
       allow_hardcoded, hardcoded_default, description, date_created
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     RETURNING id, system, key, value, value_type, is_sensitive, is_required,
               allow_hardcoded, hardcoded_default, description`,
    [
      system,
      key,
      value,
      payload.value_type || 'string',
      isSensitive,
      Boolean(payload.is_required),
      payload.allow_hardcoded !== false,
      payload.hardcoded_default != null ? String(payload.hardcoded_default) : null,
      payload.description || null,
    ]
  );
  return toAdminItem(result.rows[0], resolveRow(result.rows[0]));
}

async function updateConfig(id, payload) {
  const existing = await getById(id);
  const next = {
    value_type: payload.value_type !== undefined ? payload.value_type : existing.value_type,
    is_sensitive: payload.is_sensitive !== undefined ? Boolean(payload.is_sensitive) : existing.is_sensitive,
    is_required: payload.is_required !== undefined ? Boolean(payload.is_required) : existing.is_required,
    allow_hardcoded: payload.allow_hardcoded !== undefined ? Boolean(payload.allow_hardcoded) : existing.allow_hardcoded,
    hardcoded_default: payload.hardcoded_default !== undefined ? payload.hardcoded_default : existing.hardcoded_default,
    description: payload.description !== undefined ? payload.description : existing.description,
  };

  let value = existing.value;
  if (Object.prototype.hasOwnProperty.call(payload, 'value')) {
    if (payload.value === null || payload.value === '') {
      value = null;
    } else if (next.is_sensitive) {
      value = encryptForStorage(payload.value);
    } else {
      value = String(payload.value);
    }
  }

  const result = await query(
    `UPDATE system_configs SET
       value = $2,
       value_type = $3,
       is_sensitive = $4,
       is_required = $5,
       allow_hardcoded = $6,
       hardcoded_default = $7,
       description = $8,
       date_updated = NOW()
     WHERE id = $1
     RETURNING id, system, key, value, value_type, is_sensitive, is_required,
               allow_hardcoded, hardcoded_default, description`,
    [
      id,
      value,
      next.value_type || 'string',
      next.is_sensitive,
      next.is_required,
      next.allow_hardcoded,
      next.hardcoded_default,
      next.description,
    ]
  );
  return toAdminItem(result.rows[0], resolveRow(result.rows[0]));
}

async function clearConfigValue(id) {
  const result = await query(
    `UPDATE system_configs SET value = NULL, date_updated = NOW()
     WHERE id = $1
     RETURNING id, system, key, value, value_type, is_sensitive, is_required,
               allow_hardcoded, hardcoded_default, description`,
    [id]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Config não encontrada');
  }
  return toAdminItem(result.rows[0], resolveRow(result.rows[0]));
}

async function deleteConfig(id) {
  const result = await query(
    `DELETE FROM system_configs WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Config não encontrada');
  }
  return { id: Number(result.rows[0].id) };
}

/**
 * Feature flag for external Bearer API access (system=api, key=api.enabled).
 * Default false when missing / unset.
 */
async function isApiAccessEnabled() {
  try {
    const { values } = await resolveAll('api');
    const raw = values['api.enabled'];
    if (raw === undefined || raw === null || raw === '') return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

module.exports = {
  listBySystem,
  listSystems,
  getById,
  resolveRow,
  resolveAll,
  resolvePublic,
  listAdminBySystem,
  getAdminById,
  createConfig,
  updateConfig,
  clearConfigValue,
  deleteConfig,
  encryptForStorage,
  isApiAccessEnabled,
};
