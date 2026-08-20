'use strict';

const { query } = require('../db/pool');
const memoryCache = require('./memoryCache');
const { CACHE_ENABLED_FLAG_MS } = require('./cacheTtl');
const { CACHE_ENABLED } = require('./keys');

function asBool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/**
 * Lê system_configs cache.enabled (default false).
 * Resultado memoizado ~30s em memoryCache (meta key).
 */
async function isCacheEnabled() {
  const cached = memoryCache.get(CACHE_ENABLED);
  if (cached !== undefined) return Boolean(cached);

  let enabled = false;
  try {
    const result = await query(
      `SELECT value, hardcoded_default FROM system_configs
       WHERE system = 'cache' AND key = 'cache.enabled' LIMIT 1`
    );
    const row = result.rows[0];
    if (row) {
      if (row.value != null && row.value !== '') {
        enabled = asBool(row.value, false);
      } else if (row.hardcoded_default != null && row.hardcoded_default !== '') {
        enabled = asBool(row.hardcoded_default, false);
      }
    }
  } catch {
    enabled = false;
  }

  memoryCache.set(CACHE_ENABLED, enabled, CACHE_ENABLED_FLAG_MS);
  return enabled;
}

function invalidateCacheEnabledFlag() {
  memoryCache.invalidate(CACHE_ENABLED);
}

module.exports = {
  asBool,
  isCacheEnabled,
  invalidateCacheEnabledFlag,
};
