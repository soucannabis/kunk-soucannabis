import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
} from '@mui/material';
import { TrackingPanel, displayTrackingCode } from './TrackingPanel.jsx';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';

export default function TrackingDetailsModal({ open, order, api, onClose }) {
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!order?.id || !api?.getOrderTracking) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.getOrderTracking(order.id);
      setTracking(res?.data || res || null);
    } catch (err) {
      setError(err?.message || 'Falha ao buscar rastreio');
      setTracking(null);
    } finally {
      setLoading(false);
    }
  }, [api, order?.id]);

  useEffect(() => {
    if (!open || !order?.id) {
      setTracking(null);
      setError('');
      return;
    }
    void refresh();
  }, [open, order?.id, refresh]);

  const code = displayTrackingCode(order) || tracking?.tracking_code || '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>
        Detalhes do rastreio
        {order?.id ? (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            Pedido #{order.id}
            {code ? ` — ${code}` : ''}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent dividers>
        {error ? (
          <Typography color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        ) : null}
        <TrackingPanel
          order={order}
          tracking={tracking}
          loading={loading}
          onRefresh={refresh}
          compact
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
