import React from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PRESETS } from './analyticsLayout.js';

const GREEN = '#496b4c';

export default function AnalyticsGlobalFilters({
  period,
  onPreset,
  onChangeRange,
  onApply,
  embedded = false,
}) {
  return (
    <Box
      sx={
        embedded
          ? undefined
          : {
              p: 2,
              mb: 2,
              bgcolor: '#fff',
              borderRadius: 2,
              border: '1px solid #e6ebe6',
            }
      }
    >
      <Typography variant="subtitle2" sx={{ mb: 1, color: '#465348', fontWeight: 700 }}>
        Filtro global de período
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {PRESETS.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              clickable
              onClick={() => onPreset(p.id)}
              color={period.preset === p.id ? 'primary' : 'default'}
              sx={
                period.preset === p.id
                  ? { bgcolor: GREEN, color: '#fff', '&:hover': { bgcolor: '#3d5a40' } }
                  : undefined
              }
            />
          ))}
        </Stack>
        <TextField
          size="small"
          type="date"
          label="De"
          InputLabelProps={{ shrink: true }}
          value={period.start || ''}
          onChange={(e) => onChangeRange({ start: e.target.value })}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="Até"
          InputLabelProps={{ shrink: true }}
          value={period.end || ''}
          onChange={(e) => onChangeRange({ end: e.target.value })}
          sx={{ width: 160 }}
        />
        <Button
          variant="contained"
          onClick={onApply}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#3d5a40' }, textTransform: 'none', fontWeight: 700 }}
        >
          Aplicar
        </Button>
      </Stack>
    </Box>
  );
}
