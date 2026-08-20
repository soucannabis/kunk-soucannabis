import React from 'react';
import { Box, Button, Typography } from '@mui/joy';
import { useNavigate } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';

export function UnauthorizedPage() {
  const { logout } = useOperatorAuth();
  const navigate = useNavigate();

  async function onLeave() {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  }

  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography level="h3" sx={{ mb: 2 }}>
        Não autorizado
      </Typography>
      <Typography level="body-md" sx={{ mb: 3 }}>
        Você não tem permissão para acessar o Kunk.
      </Typography>
      <Button onClick={onLeave}>Voltar ao login</Button>
    </Box>
  );
}
