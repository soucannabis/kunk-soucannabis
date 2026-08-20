import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AdminLoader } from '../components/AdminLoader.jsx';

const InstallStatusContext = createContext(null);

/**
 * Loads GET /auth/install-status once and shares needsInstall across the app.
 */
export function InstallStatusProvider({ api, children }) {
  const [needsInstall, setNeedsInstall] = useState(null);
  const [needsSchema, setNeedsSchema] = useState(false);
  const [canInstallSample, setCanInstallSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.installStatus();
      const needs = Boolean(res.data?.needs_install);
      const schema = Boolean(res.data?.needs_schema);
      const canSample = Boolean(res.data?.can_install_sample);
      setNeedsInstall(needs);
      setNeedsSchema(schema);
      setCanInstallSample(canSample);
      return { needsInstall: needs, needsSchema: schema, canInstallSample: canSample };
    } catch (err) {
      setError(err.message || 'Falha ao verificar instalação');
      setNeedsInstall(false);
      setNeedsSchema(false);
      setCanInstallSample(false);
      return { needsInstall: false, needsSchema: false, canInstallSample: false };
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      needsInstall,
      needsSchema,
      canInstallSample,
      loading,
      error,
      refresh,
      markSchemaReady: () => setNeedsSchema(false),
      markInstalled: ({ expectSample = false } = {}) => {
        setNeedsInstall(false);
        setNeedsSchema(false);
        setCanInstallSample(Boolean(expectSample));
      },
      markSampleInstalled: () => setCanInstallSample(false),
    }),
    [needsInstall, needsSchema, canInstallSample, loading, error, refresh]
  );

  return (
    <InstallStatusContext.Provider value={value}>{children}</InstallStatusContext.Provider>
  );
}

export function useInstallStatus() {
  const ctx = useContext(InstallStatusContext);
  if (!ctx) throw new Error('useInstallStatus must be used within InstallStatusProvider');
  return ctx;
}

/**
 * Redirects to /instalacao when the system has no operators yet.
 * Skip when already on /instalacao.
 */
export function RequireInstalledOrSetup({ children }) {
  const { needsInstall, loading } = useInstallStatus();
  const location = useLocation();

  if (loading || needsInstall == null) {
    return <AdminLoader label="Verificando instalação…" className="admin-loader--viewport" />;
  }
  if (needsInstall && location.pathname !== '/instalacao') {
    return <Navigate to="/instalacao" replace />;
  }
  return children;
}
