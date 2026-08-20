import React from 'react';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';

export default function PlaceholderPage({ title }) {
  return (
    <Box sx={{ p: 2, color: '#fff' }}>
      {title ? (
        <Typography level="title-md" sx={{ mb: 1, color: 'rgba(255,255,255,0.75)' }}>
          {title}
        </Typography>
      ) : null}
      <Typography level="body-lg" sx={{ color: '#fff' }}>
        Module under development
      </Typography>
    </Box>
  );
}
