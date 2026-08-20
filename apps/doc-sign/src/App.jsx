import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, NavLink, Outlet, useParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { OperatorAuthProvider, useOperatorAuth } from '@kunk/auth-session';
import { getPublicConfig } from '@kunk/config';
import { LoginPage } from './pages/LoginPage.jsx';
import { NewPasswordPage } from './pages/NewPasswordPage.jsx';
import { TemplatesPage } from './pages/TemplatesPage.jsx';
import { TemplateEditorPage } from './pages/TemplateEditorPage.jsx';
import { SignPage } from './pages/SignPage.jsx';
import { ContractPage } from './pages/ContractPage.jsx';
import { ContractsPage } from './pages/ContractsPage.jsx';
import { AuditPage } from './pages/AuditPage.jsx';
import { SystemErrorBoundary } from './components/errors/SystemErrorBoundary.jsx';
import { DocSignFavicon, useDocSignBranding } from './components/DocSignBrand.jsx';
import { DocSignHeader } from './components/DocSignHeader.jsx';
import { getMissingAssociationFields } from './lib/associationGate.js';

function RedirectContratoToTermo() {
  const { id } = useParams();
  return <Navigate to={`/termos/${id}`} replace />;
}

function RequireAdmin({ api, children }) {
  const { user, loading, hasRequiredRole, logout } = useOperatorAuth();
  const [assocState, setAssocState] = useState({ checking: true, missing: null });

  useEffect(() => {
    if (loading) return undefined;
    if (!user || !hasRequiredRole) {
      setAssocState((prev) => (prev.missing?.length ? prev : { checking: false, missing: null }));
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setAssocState({ checking: true, missing: null });
      try {
        const missing = await getMissingAssociationFields(api);
        if (cancelled) return;
        if (missing.length) {
          setAssocState({ checking: false, missing });
          await logout();
          return;
        }
        setAssocState({ checking: false, missing: null });
      } catch {
        if (cancelled) return;
        setAssocState({ checking: false, missing: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user, loading, hasRequiredRole, logout]);

  if (assocState.missing?.length) {
    return <Navigate to="/login" replace state={{ associationMissing: assocState.missing }} />;
  }
  if (loading || (user && hasRequiredRole && assocState.checking)) {
    return (
      <div className="shell">
        <p className="muted">Carregando sessão…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRequiredRole) {
    return (
      <div className="shell">
        <div className="alert alert-error">Acesso restrito a Administradores.</div>
        <button type="button" className="btn" onClick={() => logout()}>
          Sair
        </button>
      </div>
    );
  }
  return children;
}

function OperatorShell({ api }) {
  const { user, logout } = useOperatorAuth();
  const {
    menuLogo,
    menuLogoFormat,
    menuLogoWidth,
  } = useDocSignBranding(api);

  return (
    <div className="app">
      <DocSignHeader
        logo={menuLogo}
        logoFormat={menuLogoFormat}
        logoWidth={menuLogoWidth}
      >
        <span className="app-header-meta">{user?.email}</span>
        <NavLink
          className={({ isActive }) => `btn nav-btn${isActive ? ' nav-btn-active' : ''}`}
          to="/termos"
        >
          Termos
        </NavLink>
        <NavLink
          className={({ isActive }) => `btn nav-btn${isActive ? ' nav-btn-active' : ''}`}
          to="/modelos"
        >
          Modelos
        </NavLink>
        <button type="button" className="btn" onClick={() => logout()}>
          Sair
        </button>
      </DocSignHeader>
      <div className="shell">
        <Outlet context={{ api }} />
      </div>
    </div>
  );
}

export default function App() {
  const bootstrap = getPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'doc-sign' }), [bootstrap.apiUrl]);

  return (
    <SystemErrorBoundary app="doc-sign" baseUrl={bootstrap.apiUrl}>
      <OperatorAuthProvider api={api} requiredRole="Administrador">
        <DocSignFavicon api={api} />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage api={api} />} />
            <Route path="/nova-senha" element={<NewPasswordPage api={api} />} />
            <Route path="/assinar/:token" element={<SignPage api={api} />} />
            <Route
              element={(
                <RequireAdmin api={api}>
                  <OperatorShell api={api} />
                </RequireAdmin>
              )}
            >
              <Route path="/" element={<Navigate to="/termos" replace />} />
              <Route path="/contratos" element={<Navigate to="/termos" replace />} />
              <Route path="/contratos/:id" element={<RedirectContratoToTermo />} />
              <Route path="/termos" element={<ContractsPage api={api} />} />
              <Route path="/termos/:id" element={<ContractPage api={api} />} />
              <Route path="/termos/:id/audit" element={<AuditPage api={api} />} />
              <Route path="/modelos" element={<TemplatesPage api={api} />} />
              <Route path="/modelos/:kind" element={<TemplateEditorPage api={api} />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </OperatorAuthProvider>
    </SystemErrorBoundary>
  );
}
