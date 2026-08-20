'use strict';

const store = new Map();

const memoryCache = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  },

  set(key, value, ttlMs) {
    const expiresAt = ttlMs != null && ttlMs > 0 ? Date.now() + ttlMs : null;
    store.set(key, { value, expiresAt });
  },

  has(key) {
    return this.get(key) !== undefined;
  },

  invalidate(key) {
    store.delete(key);
  },

  invalidatePrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  },

  clear() {
    store.clear();
  },

  size() {
    return store.size;
  },

  keys() {
    return [...store.keys()];
  },
};

module.exports = memoryCache;
