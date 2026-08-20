import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useOperatorAuth } from '@kunk/auth-session';
import { clearFrontendCachesOnly, invalidateAllAppCaches } from './appCacheInvalidation.js';

const CacheConfigContext = createContext({
  enabled: false,
  ready: false,
  isClearing: false,
  clearAllCache: async () => {},
  refreshStatus: async () => {},
});

export function CacheConfigProvider({ api, children }) {
  const { user } = useOperatorAuth();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!api?.getCacheStatus || !user) {
      setReady(true);
      return;
    }
    try {
      const res = await api.getCacheStatus();
      const next = Boolean(res.data?.enabled);
      setEnabled((prev) => {
        if (prev && !next) {
          clearFrontendCachesOnly();
        }
        return next;
      });
    } catch {
      setEnabled(false);
    } finally {
      setReady(true);
    }
  }, [api, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!user) return undefined;
    const onFocus = () => {
      refreshStatus();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, refreshStatus]);

  const clearAllCache = useCallback(async () => {
    setIsClearing(true);
    try {
      await invalidateAllAppCaches(api);
      window.location.reload();
    } catch (err) {
      console.error('Erro ao limpar cache:', err);
      clearFrontendCachesOnly();
      window.location.reload();
    } finally {
      setIsClearing(false);
    }
  }, [api]);

  const value = useMemo(
    () => ({ enabled, ready, isClearing, clearAllCache, refreshStatus }),
    [enabled, ready, isClearing, clearAllCache, refreshStatus]
  );

  return <CacheConfigContext.Provider value={value}>{children}</CacheConfigContext.Provider>;
}

export function useCacheConfig() {
  return useContext(CacheConfigContext);
}
