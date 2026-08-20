import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import {
  computeOrderTotal,
  formatCepDisplay,
  freightLabel,
  pickMatchingFreightOption,
  roundMoney,
} from '../../../lib/freightRecalc.js';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';

function formatMoney(n) {
  return roundMoney(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Assistente: compara frete do CEP antigo com nova cotação e atualiza total se necessário.
 */
export default function FreightRecalcAssistant({
  open,
  api,
  order,
  previousAddress,
  newAddress,
  onClose,
  onUpdated,
  onError,
}) {
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [applyToTotal, setApplyToTotal] = useState(true);
  const [newOption, setNewOption] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [orderFull, setOrderFull] = useState(order);

  const oldPrice = roundMoney(
    orderFull?.delivery_price ?? orderFull?.freight_option?.price ?? order?.delivery_price ?? 0
  );
  const oldLabel = freightLabel(orderFull?.freight_option || order?.freight_option);
  const oldCep = formatCepDisplay(previousAddress?.cep || order?.address?.cep);
  const newCep = formatCepDisplay(newAddress?.cep);
  const newPrice = roundMoney(newOption?.price ?? 0);
  const priceChanged = Math.abs(newPrice - oldPrice) > 0.009;

  const source = orderFull || order;
  const currentTotal = roundMoney(
    source?.total != null
      ? source.total
      : computeOrderTotal({
          items: source?.items || [],
          delivery_price: oldPrice,
          apply_to_total: applyToTotal,
          discount: source?.discount,
          donation: source?.donation,
          custom_payment: source?.custom_payment,
        })
  );

  const nextTotal = newOption
    ? computeOrderTotal({
        items: source?.items || [],
        delivery_price: newPrice,
        apply_to_total: applyToTotal,
        discount: source?.discount,
        donation: source?.donation,
        custom_payment: source?.custom_payment,
      })
    : currentTotal;

  const totalChanged = Math.abs(nextTotal - currentTotal) > 0.009;

  useEffect(() => {
    if (!open || !api || !order?.id) return undefined;
    let cancelled = false;
    setOrderFull(order);
    (async () => {
      try {
        if (!Array.isArray(order.items)) {
          const fresh = await api.getOrder(order.id);
          if (!cancelled && fresh.data) setOrderFull(fresh.data);
        }
      } catch {
        /* keep snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, api, order]);

  useEffect(() => {
    if (!open || !api || !newAddress?.cep) return undefined;
    let cancelled = false;
    (async () => {
      setQuoting(true);
      setQuoteError('');
      setNewOption(null);
      try {
        const res = await api.freightQuote({ address: newAddress });
        if (cancelled) return;
        const options = res.data?.options || [];
        setApplyToTotal(res.data?.apply_to_total !== false);
        const matched = pickMatchingFreightOption(
          options,
          order?.freight_option,
          res.data?.selected_option_key
        );
        if (!matched) {
          const errs = (res.data?.errors || []).map((e) => e.message).filter(Boolean);
          setQuoteError(
            errs.length
              ? errs.join(' · ')
              : 'Nenhuma cotação disponível para o novo CEP'
          );
          return;
        }
        setNewOption(matched);
      } catch (err) {
        if (!cancelled) {
          setQuoteError(err.message || 'Falha ao cotar frete para o novo CEP');
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, api, newAddress, order?.freight_option]);

  async function handleConfirm() {
    if (!order?.id || !api || !newOption) {
      onClose?.();
      return;
    }
    if (!priceChanged) {
      onClose?.();
      return;
    }

    setConfirming(true);
    setLoading(true);
    try {
      const full = orderFull || order;
      const delivery_price = roundMoney(newOption.price);
      const total = computeOrderTotal({
        items: full.items || [],
        delivery_price,
        apply_to_total: applyToTotal,
        discount: full.discount,
        donation: full.donation,
        custom_payment: full.custom_payment,
      });
      const res = await api.updateOrder(order.id, {
        address: newAddress,
        delivery_price,
        freight_carrier: newOption.provider || null,
        freight_option: newOption,
        total,
      });
      onUpdated?.(
        res.data || {
          ...full,
          address: newAddress,
          delivery_price,
          freight_option: newOption,
          freight_carrier: newOption.provider || null,
          total,
        }
      );
      onClose?.();
    } catch (err) {
      onError?.(err.message || 'Falha ao atualizar total do pedido');
    } finally {
      setConfirming(false);
      setLoading(false);
    }
  }

  const busy = quoting || confirming || loading;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>Recálculo de frete</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          O CEP do pedido #{order?.id} mudou. Comparando o frete cadastrado com uma nova cotação
          no mesmo serviço (quando disponível).
        </Typography>

        {quoting && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={22} />
            <Typography variant="body2">Cotando frete para o CEP {newCep}…</Typography>
          </Box>
        )}

        {!quoting && quoteError && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {quoteError}
          </Typography>
        )}

        {!quoting && !quoteError && newOption && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                Frete atual (CEP {oldCep})
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {formatMoney(oldPrice)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {oldLabel}
              </Typography>
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: priceChanged ? '#fff8e1' : '#e8f5e9',
              }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                Nova cotação (CEP {newCep})
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {formatMoney(newPrice)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {freightLabel(newOption)}
                {newOption.eta_days != null ? ` · prazo ~${newOption.eta_days} dia(s)` : ''}
              </Typography>
              {priceChanged ? (
                <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600 }}>
                  Diferença no frete: {formatMoney(newPrice - oldPrice)}
                  {applyToTotal === false
                    ? ' (frete não entra no total pela configuração da loja)'
                    : ''}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ mt: 0.75, color: 'success.main' }}>
                  O valor do frete permanece o mesmo.
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1.5,
              }}
            >
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Total do pedido agora
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.25 }}>
                  {formatMoney(currentTotal)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Total após alteração
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{
                    mt: 0.25,
                    color: totalChanged
                      ? nextTotal > currentTotal
                        ? 'warning.dark'
                        : 'success.main'
                      : 'text.primary',
                  }}
                >
                  {formatMoney(nextTotal)}
                </Typography>
              </Box>
              {totalChanged && (
                <Typography
                  variant="body2"
                  sx={{ gridColumn: '1 / -1', fontWeight: 600 }}
                >
                  Diferença no total: {formatMoney(nextTotal - currentTotal)}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} disabled={confirming}>
          Fechar
        </Button>
        {!quoting && !quoteError && newOption ? (
          <Button
            variant="contained"
            disabled={busy}
            onClick={handleConfirm}
            startIcon={confirming ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#406040' } }}
          >
            {priceChanged ? 'Atualizar total do pedido' : 'Continuar'}
          </Button>
        ) : !quoting && quoteError ? (
          <Button variant="contained" onClick={onClose} sx={{ bgcolor: GREEN }}>
            Continuar
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
