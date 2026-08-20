import React, { Suspense, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { OperatorAuthProvider, useOperatorAuth } from '@kunk/auth-session';
import { getKunkPublicConfig } from '@kunk/config';
import { KUNK_APP_ROLES } from './app/menuConfig.js';
import { buildAppRoutes } from './app/routes.jsx';
import { KunkConfigProvider } from './config/KunkConfigProvider.jsx';
import { CacheConfigProvider } from './lib/cache/CacheConfigProvider.jsx';
import { ErrorModalProvider } from './components/errors/ErrorModalProvider.jsx';
import { ToastProvider } from './components/toast/ToastProvider.jsx';
import { SystemErrorBoundary } from './components/errors/SystemErrorBoundary.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NewPasswordPage } from './pages/NewPasswordPage.jsx';
import { UnauthorizedPage } from './pages/UnauthorizedPage.jsx';
import { NotConnectedPage } from './pages/NotConnectedPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import PublicQueuePage from './pages/PublicQueuePage.jsx';
import SystemUserInvitePage from './pages/SystemUserInvitePage.jsx';
import ProfessionalReportPortalPage from './pages/ProfessionalReportPortalPage.jsx';

function AppRoutes() {
  const { roles } = useOperatorAuth();
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/nova-senha" element={<NewPasswordPage />} />
        <Route path="/cadastro" element={<SystemUserInvitePage />} />
        <Route path="/relatorio/servicos" element={<ProfessionalReportPortalPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/not-connected" element={<NotConnectedPage />} />
        <Route path="/contato" element={<PublicQueuePage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        {buildAppRoutes({ roles })}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);

  return (
    <OperatorAuthProvider api={api} allowedRoles={KUNK_APP_ROLES}>
      <KunkConfigProvider api={api}>
        <CacheConfigProvider api={api}>
          <SystemErrorBoundary app="kunk" baseUrl={bootstrap.apiUrl}>
            <ErrorModalProvider app="kunk" baseUrl={bootstrap.apiUrl}>
              <ToastProvider>
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </ToastProvider>
            </ErrorModalProvider>
          </SystemErrorBoundary>
        </CacheConfigProvider>
      </KunkConfigProvider>
    </OperatorAuthProvider>
  );
}
