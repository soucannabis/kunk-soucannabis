import memoryCache from './memoryCache.js';
import { ASSOCIATE_SESSION_KEY } from './cacheTtl.js';

export function clearFrontendCachesOnly() {
  memoryCache.clear();
  try {
    sessionStorage.removeItem(ASSOCIATE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Limpa FE + pede clear no servidor.
 * @param {{ clearCache: () => Promise<unknown> }} api
 */
export async function invalidateAllAppCaches(api) {
  clearFrontendCachesOnly();
  if (api?.clearCache) {
    await api.clearCache();
  }
}
