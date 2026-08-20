import memoryCache from './memoryCache.js';
import { CACHE_TTL, CACHE_KEYS } from './cacheTtl.js';

/**
 * @param {boolean} enabled
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any>} loader
 */
export async function getOrFetch(enabled, key, ttlMs, loader) {
  if (!enabled) {
    return loader();
  }
  const hit = memoryCache.get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  memoryCache.set(key, value, ttlMs);
  return value;
}

export async function fetchTags(api, enabled, qs = 'limit=200') {
  const key = qs === 'limit=200' ? CACHE_KEYS.TAGS_ALL : `${CACHE_KEYS.TAGS_ALL}:${qs}`;
  return getOrFetch(enabled, key, CACHE_TTL.TAGS_MS, async () => {
    const res = await api.listItems('tags', qs);
    return res.data || [];
  });
}

export async function fetchLocalProducts(api, enabled, qs = 'limit=200') {
  const key = `${CACHE_KEYS.PRODUCTS_LOCAL}:${qs}`;
  return getOrFetch(enabled, key, CACHE_TTL.PRODUCTS_CATALOG_MS, async () => {
    const res = await api.listItems('products', qs);
    return res.data || [];
  });
}

export async function fetchSoucannabisProducts(api, enabled) {
  return getOrFetch(
    enabled,
    CACHE_KEYS.PRODUCTS_SOUCANNABIS,
    CACHE_TTL.PRODUCTS_CATALOG_MS,
    async () => {
      const res = await api.listSoucannabisProducts();
      return Array.isArray(res.data) ? res.data : [];
    }
  );
}

export async function fetchAttendants(api, enabled) {
  return getOrFetch(enabled, CACHE_KEYS.ATTENDANTS, CACHE_TTL.KUNK_USERS_MS, async () => {
    const res = await api.receptionAttendants();
    return res.data || [];
  });
}

export async function fetchPrescribers(api, enabled) {
  return getOrFetch(
    enabled,
    CACHE_KEYS.PROFESSIONALS_PRESCRIBERS,
    CACHE_TTL.PROFESSIONALS_MS,
    async () => {
      const res = await api.listProfessionals({ is_prescriber: true });
      return res.data || [];
    }
  );
}

export async function fetchServicesDefaultList(api, enabled, paramsString) {
  return getOrFetch(
    enabled,
    `${CACHE_KEYS.SERVICES_DEFAULT}:${paramsString}`,
    CACHE_TTL.SERVICES_LIST_DEFAULT_MS,
    async () => {
      const res = await api.listServices(paramsString);
      return res.data || [];
    }
  );
}

export async function fetchAssociateUser(api, enabled, userCode, qs = 'patients=1') {
  if (!userCode) return null;
  const query = qs || '';
  return getOrFetch(
    enabled,
    `${CACHE_KEYS.associateUser(userCode)}:${query || 'default'}`,
    CACHE_TTL.ASSOCIATE_USER_MS,
    async () => {
      const res = await api.getUserByCode(userCode, query);
      return res.data || null;
    }
  );
}

export function invalidateTagsCache() {
  memoryCache.invalidatePrefix('tags:');
}

export function invalidateProductsCache() {
  memoryCache.invalidatePrefix('products:catalog:');
}

export function invalidateServicesCache() {
  memoryCache.invalidatePrefix('services:list:');
}

export async function fetchCollaboratorProfessionals(api, enabled) {
  return getOrFetch(
    enabled,
    'professionals:collaborators:active',
    CACHE_TTL.PROFESSIONALS_MS,
    async () => {
      const res = await api.listProfessionals({ active: 1, role: 'collaborators' });
      return res.data || [];
    }
  );
}

export function invalidateProfessionalsCache() {
  memoryCache.invalidate(CACHE_KEYS.PROFESSIONALS_PRESCRIBERS);
  memoryCache.invalidate('professionals:collaborators:active');
}

export function invalidateAssociateCache(userCode) {
  if (!userCode) {
    memoryCache.invalidatePrefix('associate:');
    return;
  }
  memoryCache.invalidatePrefix(`associate:user:${userCode}`);
  memoryCache.invalidatePrefix(`associate:docs:${userCode}`);
}

export { memoryCache, CACHE_TTL, CACHE_KEYS };
