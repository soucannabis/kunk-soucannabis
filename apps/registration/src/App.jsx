import React, { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { AssociateAuthProvider } from '@kunk/auth-session';
import { getPublicConfig } from '@kunk/config';
import { PublicConfigProvider } from './config/PublicConfigProvider.jsx';
import { AppShell, PhaseGuard, PhaseHomeRedirect, PublicLayout } from './layout/AppShell.jsx';
import { SignupPage, LoginPage, NewPasswordPage } from './pages/AuthPages.jsx';
import { WelcomePage } from './pages/WelcomePage.jsx';
import { AssociateRegistrationPage } from './pages/AssociateRegistrationPage.jsx';
import { PatientRegistrationPage } from './pages/PatientRegistrationPage.jsx';
import { DocumentsPage } from './pages/DocumentsPage.jsx';
import { RegistrationCompletePage, ConsultationPage } from './pages/ConsultationPages.jsx';
import { ContactPage } from './pages/ContactPage.jsx';
import { SystemErrorBoundary } from './components/errors/SystemErrorBoundary.jsx';
import { PHASE } from './lib/associatePhases.js';

export default function App() {
  const bootstrap = getPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl }), [bootstrap.apiUrl]);

  return (
    <SystemErrorBoundary app="registration" baseUrl={bootstrap.apiUrl}>
      <PublicConfigProvider api={api}>
        <AssociateAuthProvider api={api}>
          <BrowserRouter>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/cadastro" element={<SignupPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/nova-senha" element={<NewPasswordPage api={api} />} />
              </Route>

              <Route path="/contato" element={<ContactPage />} />

              <Route element={<AppShell />}>
                <Route path="/" element={<PhaseHomeRedirect />} />
                <Route
                  path="/bem-vindo"
                  element={(
                    <PhaseGuard allow={[PHASE.CADASTRO_CRIADO]}>
                      <WelcomePage />
                    </PhaseGuard>
                  )}
                />
                <Route
                  path="/cadastro-associado"
                  element={(
                    <PhaseGuard allow={[PHASE.CADASTRO_CRIADO, PHASE.DADOS_PESSOAIS]}>
                      <AssociateRegistrationPage api={api} />
                    </PhaseGuard>
                  )}
                />
                <Route
                  path="/cadastro-paciente"
                  element={(
                    <PhaseGuard allow={[PHASE.DADOS_PESSOAIS]}>
                      <PatientRegistrationPage api={api} />
                    </PhaseGuard>
                  )}
                />
                <Route
                  path="/documentos"
                  element={(
                    <PhaseGuard allow={[PHASE.DOCUMENTOS, PHASE.ASSINATURA_TERMO]}>
                      <DocumentsPage api={api} />
                    </PhaseGuard>
                  )}
                />
                <Route
                  path="/finalizar"
                  element={(
                    <PhaseGuard allow={['associado']}>
                      <ConsultationPage api={api} />
                    </PhaseGuard>
                  )}
                />
                <Route path="/consulta" element={<Navigate to="/finalizar" replace />} />
                <Route
                  path="/cadastro-concluido"
                  element={(
                    <PhaseGuard allow={['done']}>
                      <RegistrationCompletePage />
                    </PhaseGuard>
                  )}
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AssociateAuthProvider>
      </PublicConfigProvider>
    </SystemErrorBoundary>
  );
}
