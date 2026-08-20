import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { PATHS } from '../app/menuConfig.js';
import { isProfessionalOnly } from './roleRedirect.js';

export function RequireKunkStaff({ children }) {
  const { user, loading, hasRequiredRole, roles } = useOperatorAuth();

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography level="body-md">Carregando sessão…</Typography>
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (isProfessionalOnly(roles)) {
    return <Navigate to={PATHS.professionalServicesReport} replace />;
  }
  if (!hasRequiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
}
