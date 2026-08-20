import React from 'react';
import { Box, Typography } from '@mui/joy';

export default function NotFoundPage() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography level="h4">Página não encontrada</Typography>
      <Typography level="body-md" sx={{ mt: 1 }}>
        Module under development
      </Typography>
    </Box>
  );
}
