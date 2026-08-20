import React from 'react';
import { Box, Typography } from '@mui/joy';

export function NotConnectedPage() {
  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography level="h3" sx={{ mb: 2 }}>
        Não conectado
      </Typography>
      <Typography level="body-md">
        Não foi possível conectar à API. Verifique a rede e tente novamente.
      </Typography>
    </Box>
  );
}
