import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import { PATHS } from '../app/menuConfig.js';
import { isProfessionalOnly } from '../auth/roleRedirect.js';
import ServicesReportPage from './ServicesReportPage.jsx';

export default function ProfessionalReportPortalPage() {
  const { user, loading, logout, roles } = useOperatorAuth();

  if (loading) {
    return <div style={{ padding: 24 }}>Carregando…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!isProfessionalOnly(roles) && !roles.includes('Profissional')) {
    return <Navigate to="/app" replace />;
  }
  if (!isProfessionalOnly(roles)) {
    return <Navigate to={PATHS.servicesReport} replace />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: 16 }}>
      <ServicesReportPage
        mode="portal"
        onLogout={async () => {
          try {
            await logout();
          } catch {
            /* ignore */
          }
          window.location.href = '/login';
        }}
      />
    </div>
  );
}
