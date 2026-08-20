'use strict';

const memoryCache = require('./memoryCache');
const cacheTtl = require('./cacheTtl');
const keys = require('./keys');
const { isCacheEnabled, invalidateCacheEnabledFlag, asBool } = require('./isCacheEnabled');

/**
 * get-or-load com respeito a cache.enabled.
 * Se desabilitado, sempre chama loader e não grava.
 */
async function getOrSet(key, ttlMs, loader) {
  const enabled = await isCacheEnabled();
  if (!enabled) {
    return loader();
  }
  const hit = memoryCache.get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  memoryCache.set(key, value, ttlMs);
  return value;
}

function clearAll() {
  memoryCache.clear();
}

module.exports = {
  memoryCache,
  cacheTtl,
  keys,
  isCacheEnabled,
  invalidateCacheEnabledFlag,
  asBool,
  getOrSet,
  clearAll,
};
