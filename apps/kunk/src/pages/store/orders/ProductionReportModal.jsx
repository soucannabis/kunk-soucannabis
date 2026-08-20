import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';
import { exportProductionReport, openProductionReportPdf } from '../../../lib/productionReportPdf.js';

function operatorFirstName(user) {
  const fullName =
    user?.name ||
    user?.display_name ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  return String(fullName || 'Produção').trim().split(/\s+/)[0] || 'Produção';
}

/** Placeholder de seed / valor vazio — ainda não entrou em relatório de produção. */
function hasProductionReportOwner(order) {
  const owner = String(order?.production_owner || '').trim();
  if (!owner) return false;
  return owner.toLowerCase() !== 'não atribuído';
}

export default function ProductionReportModal({ open, orders, api, onClose, onComplete }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');
  const count = orders?.length || 0;
  const doneCount = useMemo(
    () => Object.values(progress).filter((message) => message !== 'Processando receita…').length,
    [progress]
  );

  useEffect(() => {
    if (open) {
      setBusy(false);
      setProgress({});
      setError('');
    }
  }, [open]);

  async function generate() {
    if (!count) return;
    setBusy(true);
    setError('');
    try {
      const { skipped, pdfUrl, filename } = await exportProductionReport(api, orders, (orderId, message) => {
        setProgress((previous) => ({ ...previous, [orderId]: message }));
      });
      let owner = 'Produção';
      try {
        const me = await api.me();
        owner = operatorFirstName(me.data);
      } catch {
        /* O PDF continua válido se a identificação do operador não estiver disponível. */
      }
      const newlyMarked = orders.filter((order) => !hasProductionReportOwner(order));
      await Promise.all(
        newlyMarked.map((order) =>
          api.updateOrderProduction(order.id, { production_owner: owner })
        )
      );
      onComplete?.({ owner, markedIds: newlyMarked.map((order) => order.id), skipped });
      openProductionReportPdf(pdfUrl, filename);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o relatório de produção.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>Relatório de produção</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            O PDF incluirá os {count} pedido{count === 1 ? '' : 's'} selecionado{count === 1 ? '' : 's'},
            com itens agregados, registro de dispensação e receitas disponíveis.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {busy && (
            <Box>
              <LinearProgress variant={count ? 'determinate' : 'indeterminate'} value={(doneCount / count) * 100} />
              <Stack spacing={0.5} sx={{ mt: 1.5, maxHeight: 180, overflowY: 'auto' }}>
                {orders.map((order) => (
                  <Typography key={order.id} variant="caption" color="text.secondary">
                    #{order.order_code || order.id}: {progress[order.id] || 'Aguardando…'}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfOutlinedIcon />}
          onClick={generate}
          disabled={busy || !count}
        >
          {busy ? 'Gerando…' : 'Gerar PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
