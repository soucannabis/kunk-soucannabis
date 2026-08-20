import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { contentAreaDialogProps } from '../layout/contentAreaOverlay.js';

/**
 * Checkout Pagar.me (cartão / boleto / parcial).
 * context: 'order' | 'service'
 */
export default function PaymentModal({
  open,
  onClose,
  api,
  context = 'order',
  entity,
  onSuccess,
}) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [partialAmount, setPartialAmount] = useState('');

  const total =
    context === 'order'
      ? Number(entity?.total || 0)
      : Number(entity?.price_paid || entity?.price || 0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getPagarmeStatus();
        if (!cancelled) setStatus(res.data || null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Pagar.me indisponível');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, open]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError('');
      setTab(0);
      setPartialAmount('');
    }
  }, [open]);

  const splitMode = Boolean(status?.split_mode && context === 'order');
  const splitReady = Boolean(status?.split_mode && status?.payment_percentage_ok);
  const hidePartial = splitMode;
  const existingLink = entity?.payment_link || result?.payment_link;

  async function createCheckout(methods, amountOverride) {
    setLoading(true);
    setError('');
    try {
      if (splitMode && !splitReady) {
        throw new Error('Configure Pedidos SouCannabis no Admin (split incompleto)');
      }
      const body = {
        context,
        entity_id: entity.id,
        methods,
      };
      if (amountOverride != null) body.amount_override = Number(amountOverride);
      const res = await api.createPagarmeCheckout(body);
      setResult(res.data);
      onSuccess?.(res.data);
    } catch (err) {
      setError(err.message || 'Falha ao gerar link');
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { key: 'card', label: 'Cartão', methods: ['credit_card'] },
    { key: 'boleto', label: 'Boleto', methods: ['boleto'] },
  ];
  if (!hidePartial) {
    tabs.push({ key: 'partial', label: 'Cartão parcial', methods: ['credit_card'], partial: true });
  }

  const active = tabs[tab] || tabs[0];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="payment-modal" {...contentAreaDialogProps}>
      <DialogTitle>Pagamento Pagar.me</DialogTitle>
      <DialogContent>
        {splitMode && (
          <Alert severity={splitReady ? 'info' : 'warning'} sx={{ mb: 2 }} data-testid="split-banner">
            {splitReady
              ? `Pagamento com split SouCannabis (${status.payment_percentage}%)`
              : 'Configure no Admin: recipients + % inteiro para liberar o split'}
          </Alert>
        )}
        <Typography variant="body2" sx={{ mb: 1 }}>
          Total: R$ {total.toFixed(2)}
        </Typography>
        {existingLink && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Link
            </Typography>
            <Typography
              component="a"
              href={existingLink}
              target="_blank"
              rel="noreferrer"
              data-testid="payment-link"
              sx={{ display: 'block', wordBreak: 'break-all' }}
            >
              {existingLink}
            </Typography>
            <Button
              size="small"
              sx={{ mt: 0.5 }}
              onClick={() => navigator.clipboard?.writeText(existingLink)}
            >
              Copiar link
            </Button>
          </Box>
        )}
        <Tabs
          value={Math.min(tab, tabs.length - 1)}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2 }}
        >
          {tabs.map((t) => (
            <Tab key={t.key} label={t.label} />
          ))}
        </Tabs>
        {active?.partial && (
          <TextField
            fullWidth
            label="Valor parcial (R$)"
            type="number"
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
            sx={{ mb: 2 }}
            inputProps={{ min: 0.01, step: 0.01 }}
            data-testid="partial-amount"
          />
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        <Button
          variant="contained"
          disabled={loading || (splitMode && !splitReady)}
          data-testid="generate-payment-link"
          onClick={() => {
            if (active.partial) {
              if (!partialAmount || Number(partialAmount) <= 0) {
                setError('Informe um valor parcial válido');
                return;
              }
              createCheckout(active.methods, partialAmount);
            } else {
              createCheckout(active.methods);
            }
          }}
        >
          {loading ? <CircularProgress size={22} /> : 'Gerar link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
