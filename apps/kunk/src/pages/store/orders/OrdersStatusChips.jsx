import React from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';

const GREEN = '#496b4c';

/** Cores de facet no estilo legado (bootstrap). */
const STATUS_CHIP_COLORS = {
  'Aguardando pagamento': { bg: '#FFF3CD', color: '#856404' },
  'Pagamento concluído': { bg: 'rgba(73, 107, 76, 0.14)', color: '#314a34' },
  'Aguardando aprovação': { bg: '#CFE2FF', color: '#084298' },
  'Em produção': { bg: '#CCE5FF', color: '#004085' },
  Enviado: { bg: 'rgba(73, 107, 76, 0.12)', color: '#385a3c' },
  Entregue: { bg: 'rgba(73, 107, 76, 0.14)', color: '#314a34' },
  Cancelado: { bg: '#F8D7DA', color: '#842029' },
};

function chipColors(status) {
  return STATUS_CHIP_COLORS[status] || { bg: '#E2E3E5', color: '#41464B' };
}

/** Só contabilidade de status — no legado tags não entram neste bloco. */
export default function OrdersStatusChips({
  statusCounts,
  statusFilter,
  onStatusClick,
  onLoadFacets,
  facetsLoaded,
  loading,
}) {
  return (
    <Box
      data-testid="orders-facets"
      display="flex"
      flexWrap="wrap"
      gap={1.25}
      justifyContent="flex-start"
      sx={{
        width: '100%',
        p: { xs: 1.5, md: 2 },
        mb: 2,
        borderRadius: 3,
        bgcolor: '#fff',
        border: '1px solid rgba(49, 67, 51, 0.1)',
        boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
      }}
    >
      {!facetsLoaded ? (
        loading ? (
          <Box display="flex" flexDirection="column" alignItems="center" gap={1} width="100%" py={1}>
            <CircularProgress size={28} sx={{ color: GREEN }} />
            <Typography variant="body2" sx={{ color: GREEN, fontWeight: 600 }}>
              Contabilizando status…
            </Typography>
          </Box>
        ) : (
          <Button
            variant="outlined"
            onClick={onLoadFacets}
            disabled={loading}
            data-testid="show-status-counts"
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderColor: GREEN,
              color: GREEN,
              '&:hover': {
                borderColor: '#4a6a4b',
                backgroundColor: 'rgba(90, 122, 91, 0.06)',
              },
            }}
          >
            Ver contabilidade dos status
          </Button>
        )
      ) : (
        Object.entries(statusCounts || {})
          .filter(([status]) => status !== 'Entregue')
          .map(([status, count]) => {
            const { bg, color } = chipColors(status);
            const active = statusFilter === status;
            return (
              <Chip
                key={status}
                label={`${status}: ${count}`}
                onClick={() => onStatusClick(status)}
                data-testid={`status-chip-${status}`}
                sx={{
                  backgroundColor: active ? GREEN : bg,
                  color: active ? '#fff' : color,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85, transform: 'scale(1.05)' },
                }}
              />
            );
          })
      )}
    </Box>
  );
}
