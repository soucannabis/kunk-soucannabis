'use strict';

/**
 * TTLs de cache no kunk-api (memoryCache).
 * Alinhados ao legado onde couber; proxy SouCannabis usa o mesmo TTL de catálogo.
 */
module.exports = {
  TAGS_MS: 10 * 60 * 1000,
  PRODUCTS_CATALOG_MS: 5 * 60 * 1000,
  KUNK_USERS_MS: 45 * 60 * 1000,
  PROFESSIONALS_MS: 10 * 60 * 1000,
  /** Flag cache.enabled — evita bater no DB a cada request */
  CACHE_ENABLED_FLAG_MS: 30 * 1000,
};
