/**
 * TTLs de cache no browser (alinhados ao legado).
 */
export const CACHE_TTL = {
  ASSOCIATE_USER_MS: 4 * 60 * 60 * 1000,
  ASSOCIATE_DOCS_MS: 4 * 60 * 60 * 1000,
  KUNK_USERS_MS: 45 * 60 * 1000,
  TAGS_MS: 10 * 60 * 1000,
  PRODUCTS_CATALOG_MS: 10 * 60 * 1000,
  PROFESSIONALS_MS: 10 * 60 * 1000,
  SERVICES_LIST_DEFAULT_MS: 2 * 60 * 60 * 1000,
};

export const CACHE_KEYS = {
  TAGS_ALL: 'tags:all',
  PRODUCTS_LOCAL: 'products:catalog:local',
  PRODUCTS_SOUCANNABIS: 'products:catalog:soucannabis',
  ATTENDANTS: 'kunk-users:attendants',
  PROFESSIONALS_PRESCRIBERS: 'professionals:prescribers',
  SERVICES_DEFAULT: 'services:list:default14d',
  associateUser: (code) => `associate:user:${code}`,
  associateDocs: (code) => `associate:docs:${code}`,
};

export const ASSOCIATE_SESSION_KEY = 'reception:associate:cache';
