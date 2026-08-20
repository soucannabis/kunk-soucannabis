import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import {
  buildAddressQueryForMaps,
  formatAddressTextForValidation,
  getAddressValidationReasonColorKey,
  getAddressValidationReasonLabelPt,
  getConfidenceStreetLevel,
  getViaCepDisplayFromResult,
  openGoogleMapsForQuery,
} from '../../../lib/addressValidationUi.js';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';
import FreightRecalcAssistant from './FreightRecalcAssistant.jsx';
import { shouldOfferFreightRecalc } from '../../../lib/freightRecalc.js';

const GREEN = '#5a7a5b';

function maskCep(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function emptyAddressForm(addr = {}) {
  return {
    street: addr.street || '',
    number: addr.number || addr.street_number || '',
    complement: addr.complement || '',
    neighborhood: addr.neighborhood || '',
    city: addr.city || '',
    state: addr.state || '',
    cep: maskCep(addr.cep || ''),
  };
}

/**
 * Modal de detalhe da verificação de endereço (paridade com Kunk legado).
 */
export default function AddressValidationDetailModal({
  open,
  order,
  api,
  onClose,
  onOrderPatched,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [markingValid, setMarkingValid] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addressForm, setAddressForm] = useState(() => emptyAddressForm());
  const [savingAddress, setSavingAddress] = useState(false);
  const [freightAssist, setFreightAssist] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!order || !api) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEditOpen(false);
    setAddressForm(emptyAddressForm(order.address));

    const text = formatAddressTextForValidation(order)?.trim();
    const addr = order.address;
    if (!text) {
      setError('empty_text');
      setLoading(false);
      return;
    }
    if (!addr || typeof addr !== 'object' || !String(addr.street || '').trim()) {
      setError('no_structured_address');
      setLoading(false);
      return;
    }

    try {
      // Sem order_id: só detalhe, não sobrescreve address_validation
      const res = await api.validateGeoapifyAddress({ text, address: addr });
      const data = res.data;
      if (typeof data?.valid !== 'boolean' && data?.status == null) {
        setError('api_fail');
        return;
      }
      setResult(data);
    } catch {
      setError('exception');
    } finally {
      setLoading(false);
    }
  }, [api, order]);

  useEffect(() => {
    if (open && order) loadDetail();
  }, [open, order, loadDetail]);

  async function handleMarkValid() {
    if (!order?.id || !api) return;
    setMarkingValid(true);
    try {
      await api.updateOrderDetails(order.id, { address_validation: 'válido' });
      onOrderPatched?.({ ...order, address_validation: 'válido' });
      onClose?.();
    } catch {
      setError('exception');
    } finally {
      setMarkingValid(false);
    }
  }

  async function handleSaveAddress() {
    if (!order?.id || !api) return;
    setSavingAddress(true);
    try {
      const previousAddress = order.address || {};
      const address = {
        ...addressForm,
        cep: String(addressForm.cep || '').replace(/\D/g, ''),
      };
      await api.updateOrderDetails(order.id, { address });
      const patched = { ...order, address, address_validation: null };
      onOrderPatched?.(patched);
      setEditOpen(false);
      try {
        const res = await api.validateGeoapifyAddress({
          order_id: order.id,
          address,
          force: true,
        });
        if (res.data?.status) {
          onOrderPatched?.({ ...patched, address_validation: res.data.status });
          setResult(res.data);
        } else {
          await loadDetail();
        }
      } catch {
        await loadDetail();
      }

      if (shouldOfferFreightRecalc(order, previousAddress, address)) {
        setFreightAssist({ previousAddress, newAddress: address, orderSnapshot: patched });
      }
    } catch {
      setError('exception');
    } finally {
      setSavingAddress(false);
    }
  }

  const name = order?.receiver_name || order?.associate_name || '';

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>Verificação de endereço</DialogTitle>
      <DialogContent dividers>
        {order && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pedido #{order.id}
            {name ? ` — ${name}` : ''}
          </Typography>
        )}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={22} />
            <Typography variant="body2">Consultando mapa e Correios…</Typography>
          </Box>
        )}

        {!loading && error === 'empty_text' && (
          <Typography variant="body2">Sem texto de endereço para analisar.</Typography>
        )}
        {!loading && error === 'no_structured_address' && (
          <Typography variant="body2">
            Endereço não está como objeto estruturado (rua, CEP, cidade). Não é possível
            reproduzir a validação ViaCEP + mapa.
          </Typography>
        )}
        {!loading && (error === 'api_fail' || error === 'exception') && (
          <Typography variant="body2" color="error">
            Não foi possível obter o detalhe agora. Tente de novo.
          </Typography>
        )}

        {!loading && result && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Endereço do pedido
              </Typography>
              <Typography
                variant="body2"
                component="div"
                sx={{ whiteSpace: 'pre-wrap', fontWeight: 700 }}
              >
                {formatAddressTextForValidation(order)?.trim() || '—'}
                {(() => {
                  const queryPedido = buildAddressQueryForMaps(order, null);
                  if (!queryPedido) return null;
                  return (
                    <>
                      {' '}
                      <MuiLink
                        component="button"
                        type="button"
                        onClick={() => openGoogleMapsForQuery(queryPedido)}
                        sx={{
                          fontWeight: 700,
                          verticalAlign: 'baseline',
                          p: 0,
                          border: 0,
                          background: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontSize: 'inherit',
                          fontFamily: 'inherit',
                        }}
                      >
                        Ver no mapa
                      </MuiLink>
                    </>
                  );
                })()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Situação
              </Typography>
              {(() => {
                const rs = result;
                const s =
                  rs.status === 'válido' || rs.status === 'inválido' || rs.status === 'revisar'
                    ? rs.status
                    : rs.valid
                      ? 'válido'
                      : 'inválido';
                let statusLabel = '—';
                if (rs.status === 'válido') statusLabel = 'Válido';
                else if (rs.status === 'inválido') statusLabel = 'Inválido';
                else if (rs.status === 'revisar') statusLabel = 'Revisar';
                else if (rs.status == null) statusLabel = rs.valid ? 'Válido' : 'Inválido';
                const statusColor =
                  s === 'válido'
                    ? 'success.main'
                    : s === 'inválido'
                      ? 'error.main'
                      : 'warning.main';
                const reasonStr = getAddressValidationReasonLabelPt(rs.reason);
                const rk = getAddressValidationReasonColorKey(rs.reason);
                const reasonSx = {
                  color:
                    rk === 'error'
                      ? 'error.main'
                      : rk === 'warning'
                        ? 'warning.main'
                        : 'text.secondary',
                };
                const conf = getConfidenceStreetLevel(rs.confidence_street_level);
                const confSx = conf
                  ? {
                      color:
                        conf.color === 'error'
                          ? 'error.main'
                          : conf.color === 'warning'
                            ? 'warning.main'
                            : 'success.main',
                    }
                  : {};
                return (
                  <Box
                    sx={{
                      mt: 0.25,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      columnGap: 0.75,
                      rowGap: 0.5,
                    }}
                  >
                    <Typography
                      variant="body1"
                      component="span"
                      fontWeight={600}
                      sx={{ color: statusColor }}
                    >
                      {statusLabel}
                    </Typography>
                    {reasonStr ? (
                      <Typography variant="body2" component="span" sx={reasonSx}>
                        · {reasonStr}
                      </Typography>
                    ) : null}
                    {conf ? (
                      <Typography variant="body2" component="span" fontWeight={500} sx={confSx}>
                        · Confiança (rua) no mapa: {conf.label}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })()}
            </Box>

            {result.matchedFormatted && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Endereço sugerido pelo mapa
                </Typography>
                <Typography variant="body2">{result.matchedFormatted}</Typography>
              </Box>
            )}

            {result.cepValidatedBy &&
              (() => {
                const { cep, addressLine } = getViaCepDisplayFromResult(result);
                if (!cep && !addressLine) return null;
                const queryCorreios = [addressLine, cep].filter(Boolean).join(', ');
                return (
                  <Box
                    sx={{
                      mt: 0.5,
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: '#e8f5e9',
                      textAlign: 'center',
                      color: '#000',
                    }}
                  >
                    {cep ? (
                      <Typography variant="body2" display="block" sx={{ color: '#000' }}>
                        CEP Validado por Correios: <strong>{cep}</strong>
                      </Typography>
                    ) : null}
                    {addressLine ? (
                      <Typography
                        variant="body2"
                        display="block"
                        sx={{ color: '#000', mt: cep ? 0.5 : 0 }}
                      >
                        Endereço Retornado: <strong>{addressLine}</strong>
                        {queryCorreios ? (
                          <>
                            {' '}
                            <MuiLink
                              component="button"
                              type="button"
                              onClick={() => openGoogleMapsForQuery(queryCorreios)}
                              sx={{
                                fontWeight: 700,
                                verticalAlign: 'baseline',
                                p: 0,
                                border: 0,
                                background: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                fontSize: 'inherit',
                                fontFamily: 'inherit',
                                color: '#000',
                              }}
                            >
                              Ver no mapa
                            </MuiLink>
                          </>
                        ) : null}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })()}
          </Box>
        )}

        {order && (
          <Collapse in={editOpen}>
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Editar endereço do pedido
              </Typography>
              <Box display="flex" flexDirection="column" gap={1} sx={{ mb: 1.5 }}>
                {[
                  ['street', 'Rua'],
                  ['number', 'Número'],
                  ['complement', 'Complemento'],
                  ['neighborhood', 'Bairro'],
                  ['city', 'Cidade'],
                  ['state', 'Estado'],
                  ['cep', 'CEP'],
                ].map(([key, label]) => (
                  <TextField
                    key={key}
                    label={label}
                    value={addressForm[key] || ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setAddressForm((a) => ({
                        ...a,
                        [key]: key === 'cep' ? maskCep(raw) : raw,
                      }));
                    }}
                    inputProps={
                      key === 'cep'
                        ? { inputMode: 'numeric', maxLength: 9, placeholder: '00000-000' }
                        : undefined
                    }
                    fullWidth
                    margin="dense"
                    size="small"
                  />
                ))}
              </Box>
              <Box display="flex" flexWrap="wrap" gap={1}>
                <Button
                  variant="contained"
                  onClick={handleSaveAddress}
                  disabled={savingAddress}
                  startIcon={
                    savingAddress ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <SaveIcon />
                    )
                  }
                  sx={{ backgroundColor: GREEN, color: 'white' }}
                >
                  Salvar endereço
                </Button>
                <Button onClick={() => setEditOpen(false)} disabled={savingAddress}>
                  Cancelar
                </Button>
              </Box>
            </Box>
          </Collapse>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={
              markingValid ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />
            }
            disabled={!order?.id || markingValid}
            onClick={handleMarkValid}
          >
            Válido
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            disabled={!order?.id}
            onClick={() => setEditOpen(true)}
          >
            Editar endereço
          </Button>
        </Box>
        <Button onClick={onClose} variant="contained">
          Fechar
        </Button>
      </DialogActions>
    </Dialog>

      <FreightRecalcAssistant
        open={Boolean(freightAssist)}
        api={api}
        order={freightAssist?.orderSnapshot || order}
        previousAddress={freightAssist?.previousAddress}
        newAddress={freightAssist?.newAddress}
        onClose={() => setFreightAssist(null)}
        onError={() => setError('exception')}
        onUpdated={(updated) => {
          onOrderPatched?.(updated);
        }}
      />
    </>
  );
}
