import React, { useMemo } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

export function displayTrackingCode(order) {
  const t = String(order?.tracking_code || '').trim();
  if (t && !isUuidLike(t) && !/^aguardando/i.test(t) && !/^https?:\/\//i.test(t)) return t;
  return '';
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch {
    return String(v);
  }
}

function resolveProvider(tracking, order) {
  return String(
    tracking?.provider ||
      order?.external_delivery_type ||
      order?.freight_carrier ||
      order?.freight_option?.provider ||
      ''
  ).toLowerCase();
}

export function TrackingPanel({ order, tracking, loading, onRefresh, compact = false }) {
  const code = tracking?.tracking_code || displayTrackingCode(order);
  const provider = resolveProvider(tracking, order);

  const history = useMemo(() => {
    const raw = tracking?.package?.trackingHistory;
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => {
      const ta = new Date(a?.status?.updatedTime || 0).getTime();
      const tb = new Date(b?.status?.updatedTime || 0).getTime();
      return tb - ta;
    });
  }, [tracking]);

  const meShipment = tracking?.shipment;

  return (
    <Box
      sx={{
        p: compact ? 0 : 2,
        borderRadius: compact ? 0 : 2,
        bgcolor: compact ? 'transparent' : '#f7f8f7',
        border: compact ? 'none' : '1px solid #e4e8e4',
        height: '100%',
        minHeight: compact ? 0 : 280,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Rastreamento</Typography>
        <IconButton size="small" onClick={onRefresh} disabled={loading} aria-label="Atualizar rastreio">
          {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {provider === 'loggi' ? 'Loggi' : provider === 'melhorenvio' ? 'Melhor Envio' : 'Sem transportadora'}
      </Typography>

      {code ? (
        <Typography sx={{ fontWeight: 700, mb: 1, wordBreak: 'break-all' }}>{code}</Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Código de rastreio ainda não disponível
          {order?.carrier_order_code ? ' (etiqueta/carrinho gerado).' : '.'}
        </Typography>
      )}

      {tracking?.pending && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
          {tracking.message ||
            'Código gerado, mas o histórico ainda não está disponível na Loggi. Tente novamente em alguns minutos.'}
        </Typography>
      )}

      {tracking?.message && !tracking?.pending && !tracking?.package && !tracking?.shipment && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {tracking.message}
        </Typography>
      )}

      {tracking?.tracking_url && (
        <Link href={tracking.tracking_url} target="_blank" rel="noreferrer" sx={{ display: 'block', mb: 1 }}>
          Abrir rastreio
        </Link>
      )}

      {provider === 'loggi' && tracking?.package && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">
            Status:{' '}
            <strong>
              {tracking.package?.status?.description || tracking.package?.status?.code || '—'}
            </strong>
          </Typography>
          {tracking.package?.location && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Local:{' '}
              {[tracking.package.location.city, tracking.package.location.state].filter(Boolean).join(', ') ||
                '—'}
            </Typography>
          )}
          {tracking.package?.deliveryInformation?.receiverName && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Recebido por: {tracking.package.deliveryInformation.receiverName}
            </Typography>
          )}
          {history.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Histórico
              </Typography>
              <Stack
                spacing={0.75}
                sx={{ maxHeight: 280, overflow: 'auto' }}
                data-testid="tracking-history"
              >
                {history.map((h, i) => (
                  <Box key={i} sx={{ pl: 1, borderLeft: '2px solid #c5d0c5' }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(h?.status?.updatedTime)}
                    </Typography>
                    <Typography variant="body2">{h?.status?.description || h?.status?.code || '—'}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}

      {provider === 'melhorenvio' && meShipment && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">
            Status: <strong>{meShipment.status || '—'}</strong>
          </Typography>
          {meShipment.protocol && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Protocolo: {meShipment.protocol}
            </Typography>
          )}
          {meShipment.posted_at && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Postado: {formatDate(meShipment.posted_at)}
            </Typography>
          )}
          {meShipment.delivered_at && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Entregue: {formatDate(meShipment.delivered_at)}
            </Typography>
          )}
          {meShipment.tracking && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Tracking ME: {meShipment.tracking}
            </Typography>
          )}
        </Box>
      )}

      {!tracking && !loading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Clique em atualizar para buscar detalhes na transportadora.
        </Typography>
      )}
    </Box>
  );
}
