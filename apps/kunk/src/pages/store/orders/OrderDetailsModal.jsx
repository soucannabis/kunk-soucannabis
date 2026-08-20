import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useErrorModal } from '../../../components/errors/ErrorModalProvider.jsx';
import {
  contentAreaDialogProps,
  contentAreaSelectProps,
} from '../../../layout/contentAreaOverlay.js';
import FreightRecalcAssistant from './FreightRecalcAssistant.jsx';
import { shouldOfferFreightRecalc } from '../../../lib/freightRecalc.js';
import { TrackingPanel, displayTrackingCode } from './TrackingPanel.jsx';

const GREEN = '#5a7a5b';
const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function maskCep(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch {
    return String(v);
  }
}

function formatCpf(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11) return v || '—';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '—';
  // Remove código do país 55 quando presente (ex.: +5512900000001)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '—';
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return 'Endereço não informado';
  const line1 = [addr.street, addr.number || addr.street_number].filter(Boolean).join(', ');
  const line2 = [addr.complement, addr.neighborhood].filter(Boolean).join(' — ');
  const line3 = [addr.city, addr.state, addr.cep].filter(Boolean).join(' / ');
  return [line1, line2, line3].filter(Boolean).join('\n') || 'Endereço não informado';
}

function emptyAddress() {
  return {
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: '',
  };
}

export { displayTrackingCode };

export default function OrderDetailsModal({
  open,
  orderId,
  api,
  statusOptions = [],
  awaitingStatus,
  paidStatus,
  onClose,
  onSaved,
}) {
  const { showError } = useErrorModal();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState(null);
  const [receiverName, setReceiverName] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('');
  const [address, setAddress] = useState(emptyAddress());
  const [editAddress, setEditAddress] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [freightAssist, setFreightAssist] = useState(null); // { previousAddress, newAddress }

  const load = useCallback(async () => {
    if (!orderId || !api) return;
    setLoading(true);
    try {
      const res = await api.getOrder(orderId);
      const data = res.data;
      setOrder(data);
      setReceiverName(data.receiver_name || data.associate_name || '');
      setDetails(data.details || data.info || data.order_notes || '');
      setStatus(data.status || '');
      setAddress({
        ...emptyAddress(),
        ...(data.address && typeof data.address === 'object' ? data.address : {}),
        cep: maskCep(data.address?.cep),
      });
      setEditAddress(false);
      setTracking(null);
    } catch (err) {
      showError(err.message || 'Falha ao carregar pedido');
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [api, orderId, onClose, showError]);

  useEffect(() => {
    if (open && orderId) load();
  }, [open, orderId, load]);

  async function refreshTracking() {
    if (!orderId) return;
    setTrackingLoading(true);
    try {
      const res = await api.getOrderTracking(orderId);
      setTracking(res.data);
      if (res.data?.tracking_code) {
        setOrder((prev) => (prev ? { ...prev, tracking_code: res.data.tracking_code } : prev));
      }
    } catch (err) {
      showError(err.message || 'Falha ao buscar rastreio');
    } finally {
      setTrackingLoading(false);
    }
  }

  async function handleSave() {
    if (!order) return;
    setSaving(true);
    setMsg('');
    try {
      const previousAddress = order.address || emptyAddress();
      const nextAddress = {
        ...address,
        cep: String(address.cep || '').replace(/\D/g, ''),
        number: address.number || address.street_number || '',
      };
      await api.updateOrderDetails(order.id, {
        receiver_name: receiverName,
        details,
        address: nextAddress,
      });
      if (status && status !== order.status) {
        await api.updateOrderStatus(order.id, status);
      }
      try {
        const v = await api.validateGeoapifyAddress({
          order_id: order.id,
          address: nextAddress,
          force: true,
        });
        if (v.data?.status) {
          setOrder((prev) =>
            prev ? { ...prev, address: nextAddress, address_validation: v.data.status } : prev
          );
        } else {
          setOrder((prev) => (prev ? { ...prev, address: nextAddress } : prev));
        }
      } catch {
        setOrder((prev) => (prev ? { ...prev, address: nextAddress } : prev));
      }
      setMsg('Pedido atualizado');
      await load();
      onSaved?.();

      if (shouldOfferFreightRecalc(order, previousAddress, nextAddress)) {
        setFreightAssist({
          previousAddress,
          newAddress: nextAddress,
          orderSnapshot: { ...order, address: nextAddress },
        });
      }
    } catch (err) {
      showError(err.message || 'Falha ao salvar pedido');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(fileList) {
    if (!order || !fileList?.length) return;
    setUploading(true);
    setMsg('');
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('filename', file.name);
        const uploaded = await api.uploadFile(fd);
        const fileId = uploaded.data?.id;
        if (!fileId) throw new Error('Upload sem id de arquivo');
        const attached = await api.attachOrderFile(order.id, {
          file_id: fileId,
          confirm_payment: true,
        });
        if (attached.data?.payment_confirmed) {
          setMsg('Comprovante anexado — status atualizado para pagamento concluído');
        } else {
          setMsg('Comprovante anexado');
        }
      }
      await load();
      onSaved?.();
    } catch (err) {
      showError(err.message || 'Falha no upload do comprovante');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const statuses = statusOptions.length
    ? statusOptions
    : [awaitingStatus, paidStatus, 'Cancelado', 'Entregue'].filter(Boolean);

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper" data-testid="order-details-modal" {...contentAreaDialogProps}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Detalhes do pedido {order ? `#${order.id}` : ''}
      </DialogTitle>
      <DialogContent dividers>
        {loading || !order ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
              gap: 2.5,
            }}
          >
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Comprovantes de pagamento
                </Typography>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => handleUpload(e.target.files)}
                />
                <Button
                  variant="outlined"
                  startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ borderColor: GREEN, color: GREEN, mb: 1 }}
                >
                  Enviar comprovante
                </Button>
                {(order.files || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum arquivo anexado
                  </Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {(order.files || []).map((f) => (
                      <Link
                        key={f.id}
                        href={api.fileDownloadUrl ? api.fileDownloadUrl(f.id) : f.url}
                        target="_blank"
                        rel="noreferrer"
                        underline="hover"
                      >
                        {f.filename}
                      </Link>
                    ))}
                  </Stack>
                )}
              </Box>

              <TextField
                select
                label="Status"
                size="small"
                fullWidth
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                SelectProps={contentAreaSelectProps}
              >
                {statuses.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
                {status && !statuses.includes(status) && (
                  <MenuItem value={status}>{status}</MenuItem>
                )}
              </TextField>

              <TextField
                label="Nome do recebedor"
                size="small"
                fullWidth
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                helperText="Usado na etiqueta. Por padrão é o nome do associado."
              />

              <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                {order.institutional_client || order.institutional_client_id ? (
                  <>
                    Cliente institucional:{' '}
                    {order.institutional_client?.name || order.associate_name || '—'}
                    {' · '}
                    Doc. {order.institutional_client?.document || '—'}
                    {' · '}
                    {formatPhone(order.institutional_client?.phone)}
                    {order.institutional_client_code
                      ? ` (${order.institutional_client_code})`
                      : ''}
                  </>
                ) : (
                  <>
                    Associado:{' '}
                    {order.associate?.name || order.associate_name || '—'}
                    {' · '}
                    CPF {formatCpf(order.associate?.cpf)}
                    {' · '}
                    {formatPhone(order.associate?.phone)}
                    {order.user_code ? ` (${order.user_code})` : ''}
                  </>
                )}
              </Typography>

              <TextField
                label="Informações do pedido"
                multiline
                minRows={3}
                fullWidth
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Endereço do pedido
                  </Typography>
                  <IconButton size="small" onClick={() => setEditAddress((v) => !v)} aria-label="Editar endereço">
                    {editAddress ? <ExpandLessIcon /> : <EditIcon fontSize="small" />}
                  </IconButton>
                </Box>
                {!editAddress ? (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                    {formatAddress(address)}
                  </Typography>
                ) : (
                  <Collapse in={editAddress}>
                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                      <TextField
                        label="Rua"
                        size="small"
                        fullWidth
                        value={address.street}
                        onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          label="Número"
                          size="small"
                          value={address.number || ''}
                          onChange={(e) => setAddress((a) => ({ ...a, number: e.target.value }))}
                          sx={{ width: 120 }}
                        />
                        <TextField
                          label="Complemento"
                          size="small"
                          fullWidth
                          value={address.complement || ''}
                          onChange={(e) => setAddress((a) => ({ ...a, complement: e.target.value }))}
                        />
                      </Box>
                      <TextField
                        label="Bairro"
                        size="small"
                        fullWidth
                        value={address.neighborhood || ''}
                        onChange={(e) => setAddress((a) => ({ ...a, neighborhood: e.target.value }))}
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          label="Cidade"
                          size="small"
                          fullWidth
                          value={address.city || ''}
                          onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                        />
                        <TextField
                          select
                          label="UF"
                          size="small"
                          value={address.state || ''}
                          onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                          SelectProps={contentAreaSelectProps}
                          sx={{ width: 100 }}
                        >
                          {UF_LIST.map((uf) => (
                            <MenuItem key={uf} value={uf}>
                              {uf}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="CEP"
                          size="small"
                          value={address.cep || ''}
                          onChange={(e) => setAddress((a) => ({ ...a, cep: maskCep(e.target.value) }))}
                          inputProps={{ inputMode: 'numeric', maxLength: 9, placeholder: '00000-000' }}
                          sx={{ width: 140 }}
                        />
                      </Box>
                    </Stack>
                  </Collapse>
                )}
              </Box>

              <Divider />
              <Typography variant="body2">
                Total: <strong>{formatMoney(order.total)}</strong>
                {Number(order.delivery_price) > 0 ? ` · Frete ${formatMoney(order.delivery_price)}` : ''}
              </Typography>
            </Stack>

            <Box>
              <TrackingPanel
                order={order}
                tracking={tracking}
                loading={trackingLoading}
                onRefresh={refreshTracking}
              />
            </Box>
          </Box>
        )}
        {msg && (
          <Typography sx={{ mt: 2, color: GREEN, fontWeight: 600 }} data-testid="order-details-msg">
            {msg}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Fechar</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          disabled={saving || loading || !order}
          onClick={handleSave}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#406040' } }}
        >
          Salvar alterações
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
        onError={(message) => showError(message)}
        onUpdated={(updated) => {
          setOrder((prev) => (prev ? { ...prev, ...updated } : updated));
          onSaved?.();
        }}
      />
    </>
  );
}
