'use strict';

const { query } = require('../db/pool');
const {
  memoryCache,
  isCacheEnabled,
  invalidateCacheEnabledFlag,
  asBool,
  clearAll,
  cacheTtl,
  keys,
} = require('../cache');
const { AppError } = require('../utils/response');

const SYSTEM = 'cache';
const KEY = 'cache.enabled';

async function getStatus() {
  const enabled = await isCacheEnabled();
  return {
    enabled,
    size: memoryCache.size(),
    keys: memoryCache.keys().filter((k) => !k.startsWith('meta:')),
  };
}

async function upsertEnabled(enabled) {
  const value = enabled ? 'true' : 'false';
  const existing = await query(
    `SELECT id FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [SYSTEM, KEY]
  );
  if (existing.rows[0]?.id) {
    await query(
      `UPDATE system_configs SET value = $1, date_updated = NOW() WHERE id = $2`,
      [value, existing.rows[0].id]
    );
  } else {
    await query(
      `INSERT INTO system_configs (
         system, key, value, value_type, is_sensitive, is_required,
         allow_hardcoded, hardcoded_default, description
       ) VALUES ($1, $2, $3, 'boolean', false, false, true, 'false', $4)`,
      [
        SYSTEM,
        KEY,
        value,
        'Habilita memoryCache operacional (tags, produtos, atendentes, proxy SouCannabis)',
      ]
    );
  }
  clearAll();
  invalidateCacheEnabledFlag();
  memoryCache.set(keys.CACHE_ENABLED, Boolean(enabled), cacheTtl.CACHE_ENABLED_FLAG_MS);
  return getStatus();
}

async function setEnabled(body) {
  if (body == null || typeof body.enabled !== 'boolean') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Body deve incluir enabled: boolean');
  }
  return upsertEnabled(Boolean(body.enabled));
}

async function clear() {
  const enabled = await isCacheEnabled();
  clearAll();
  invalidateCacheEnabledFlag();
  memoryCache.set(keys.CACHE_ENABLED, enabled, cacheTtl.CACHE_ENABLED_FLAG_MS);
  return {
    ok: true,
    clearedAt: new Date().toISOString(),
    enabled,
    size: memoryCache.size(),
  };
}

module.exports = {
  getStatus,
  setEnabled,
  clear,
  asBool,
};
