import React, { useCallback, useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { formatDateTime, PAYMENT_TYPES, typeLabel } from './servicesUtils.js';
import { useCacheConfig } from '../../../lib/cache/CacheConfigProvider.jsx';
import {
  fetchCollaboratorProfessionals,
  fetchTags,
} from '../../../lib/cache/fetchers.js';
import {
  contentAreaDialogProps,
  contentAreaSelectProps,
  contentAreaAutocompleteSlotProps,
} from '../../../layout/contentAreaOverlay.js';
import { useToast } from '../../../components/toast/ToastProvider.jsx';

/** Valor para input datetime-local a partir de ISO/Date do serviço. */
function toDatetimeLocalValue(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ServiceInfoModal({ open, service, api, onClose, onSaved }) {
  const [group, setGroup] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [selectedPro, setSelectedPro] = useState(null);
  const [observations, setObservations] = useState('');
  const [consultationDate, setConsultationDate] = useState('');
  const [price, setPrice] = useState('');
  const [donation, setDonation] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [tags, setTags] = useState([]);
  const [tagOpts, setTagOpts] = useState([]);
  const [paymentType, setPaymentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const { enabled: cacheEnabled } = useCacheConfig();
  const toast = useToast();

  function syncMoney({ nextPrice, nextDonation, nextPaid, touchPaid }) {
    const p = nextPrice !== undefined ? nextPrice : price;
    const d = nextDonation !== undefined ? nextDonation : donation;
    if (nextPrice !== undefined) setPrice(nextPrice);
    if (nextDonation !== undefined) setDonation(nextDonation);
    if (touchPaid && nextPaid !== undefined) {
      setPricePaid(nextPaid);
      return;
    }
    const priceN = Number(p);
    const donationN = Number(d);
    if (Number.isFinite(priceN) && Number.isFinite(donationN)) {
      setPricePaid(String(Math.max(0, priceN - donationN)));
    } else if (nextPaid !== undefined) {
      setPricePaid(nextPaid);
    }
  }

  const loadReceipts = useCallback(async () => {
    if (!service?.id) {
      setReceipts([]);
      return;
    }
    try {
      const qs = new URLSearchParams({
        filter: JSON.stringify({ service_id: { _eq: service.id } }),
        limit: '50',
        sort: '-id',
      });
      const links = await api.listItems('services_files', qs.toString());
      const rows = Array.isArray(links.data) ? links.data : [];
      const files = await Promise.all(
        rows.map(async (link) => {
          const fileId = link.file_id || link.fileId;
          if (!fileId) return null;
          try {
            const meta = await api.getFile(fileId);
            const f = meta.data || {};
            return {
              id: f.id || fileId,
              filename: f.filename || String(fileId),
              mime_type: f.mime_type || null,
              link_id: link.id,
            };
          } catch {
            return { id: fileId, filename: String(fileId), mime_type: null, link_id: link.id };
          }
        })
      );
      setReceipts(files.filter(Boolean));
    } catch {
      setReceipts([]);
    }
  }, [api, service?.id]);

  useEffect(() => {
    if (!open || !service) return;
    setObservations(service.observations || '');
    setConsultationDate(toDatetimeLocalValue(service.consultation_date));
    setPrice(service.price != null && service.price !== '' ? String(service.price) : '');
    setDonation(service.donation != null && service.donation !== '' ? String(service.donation) : '0');
    setPricePaid(
      service.price_paid != null && service.price_paid !== ''
        ? String(service.price_paid)
        : String(
            Math.max(0, (Number(service.price) || 0) - (Number(service.donation) || 0))
          )
    );
    setTags(
      (Array.isArray(service.tags) ? service.tags : [])
        .map((t) => (typeof t === 'string' ? t : t?.tag || t?.name || ''))
        .filter(Boolean)
    );
    setPaymentType(service.payment_type || '');
    setReceiptFile(null);
    setError('');
    setReceipts([]);
    (async () => {
      try {
        const [g, pros, tagList] = await Promise.all([
          service.booking_group_code
            ? api.listServicesByGroup(service.booking_group_code)
            : Promise.resolve({ data: [service] }),
          fetchCollaboratorProfessionals(api, cacheEnabled),
          fetchTags(api, cacheEnabled),
          loadReceipts(),
        ]);
        setGroup(g.data || [service]);
        setProfessionals(pros);
        setTagOpts(tagList.map((t) => t.tag).filter(Boolean));
        const match = pros.find(
          (p) =>
            String(p.professional_code) === String(service.professional_id) ||
            String(p.id) === String(service.professional_id)
        );
        setSelectedPro(match || null);
      } catch (err) {
        setError(err.message || 'Falha ao carregar');
      }
    })();
  }, [open, service, api, cacheEnabled, loadReceipts]);

  async function persist(body) {
    await api.updateService(service.id, body);
    onSaved?.();
    onClose();
  }

  async function onSave() {
    setBusy(true);
    setError('');
    try {
      const body = {
        observations,
        tags,
        payment_type: paymentType || null,
        consultation_date: consultationDate || null,
        price: price === '' ? null : Number(price),
        donation: donation === '' ? 0 : Number(donation),
        price_paid: pricePaid === '' ? null : Number(pricePaid),
      };
      if (selectedPro) {
        body.professional_id = selectedPro.professional_code || selectedPro.id;
      }
      try {
        await persist(body);
      } catch (err) {
        if (err.code === 'EVENT_DATE_CONFIRMATION_REQUIRED') {
          const ok = window.confirm(
            'Este atendimento já possui um evento no calendário. Excluir o evento antigo e criar um novo com a nova data?'
          );
          if (!ok) return;
          await persist({ ...body, replace_calendar_event: true });
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function onUploadReceipt() {
    if (!receiptFile) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', receiptFile);
      fd.append('filename', receiptFile.name || 'comprovante');
      const up = await api.uploadFile(fd);
      const fileId = up.data?.id || up.data?.file_id;
      if (!fileId) throw new Error('Upload sem id de arquivo');
      if (api.attachFile) {
        await api.attachFile(fileId, { collection: 'services', item_id: service.id });
      } else {
        await api.createItem('services_files', { service_id: service.id, file_id: fileId });
      }
      await api.markServicePaid(service.id);
      setReceiptFile(null);
      await loadReceipts();
      onSaved?.();
      toast.success('Comprovante enviado — atendimento marcado como pago');
    } catch (err) {
      setError(err.message || 'Falha no comprovante');
      toast.error(err.message || 'Falha no comprovante');
    } finally {
      setBusy(false);
    }
  }

  if (!service) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '20px' } }}
      {...contentAreaDialogProps}
    >
      <DialogTitle>Detalhes do atendimento</DialogTitle>
      <DialogContent>
        {error && <Box sx={{ color: '#b00020', mb: 1 }}>{error}</Box>}
        <Box sx={{ mb: 2 }}>
          <div>
            <strong>Profissional:</strong> {service.professional_name} · {typeLabel(service.type)}
          </div>
          <div>
            <strong>Responsável:</strong> {service.associate_name || '—'}
          </div>
          {service.patient_user_code || service.patient_name ? (
            <div>
              <strong>Paciente:</strong> {service.patient_name || service.patient_user_code}
            </div>
          ) : null}
          {group.length > 1 && (
            <Box sx={{ mt: 1, fontSize: '0.9rem' }}>
              <strong>Grupo ({group.length}):</strong>
              <ul style={{ margin: '0.25rem 0' }}>
                {group.map((g) => (
                  <li key={g.id}>
                    {g.professional_name} — {formatDateTime(g.consultation_date)}
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </Box>
        <TextField
          label="Data do atendimento"
          type="datetime-local"
          fullWidth
          margin="dense"
          InputLabelProps={{ shrink: true }}
          value={consultationDate}
          onChange={(e) => setConsultationDate(e.target.value)}
        />
        <Autocomplete
          options={professionals}
          getOptionLabel={(o) => `${o.name || ''} ${o.last_name || ''}`.trim()}
          value={selectedPro}
          onChange={(_, v) => setSelectedPro(v)}
          slotProps={contentAreaAutocompleteSlotProps}
          renderInput={(params) => (
            <TextField {...params} label="Alterar profissional" margin="dense" fullWidth />
          )}
        />
        <Box
          sx={{
            display: 'flex',
            gap: 1.25,
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            mt: 0.5,
          }}
        >
          <TextField
            label="Valor da consulta"
            type="number"
            margin="dense"
            value={price}
            onChange={(e) => syncMoney({ nextPrice: e.target.value })}
            inputProps={{ min: 0, step: '0.01' }}
            sx={{ flex: 1, minWidth: 120 }}
          />
          <TextField
            label="Doação"
            type="number"
            margin="dense"
            value={donation}
            onChange={(e) => syncMoney({ nextDonation: e.target.value })}
            inputProps={{ min: 0, step: '0.01' }}
            sx={{ flex: 1, minWidth: 100 }}
          />
          <TextField
            label="Valor pago"
            type="number"
            margin="dense"
            value={pricePaid}
            onChange={(e) => syncMoney({ nextPaid: e.target.value, touchPaid: true })}
            inputProps={{ min: 0, step: '0.01' }}
            sx={{ flex: 1, minWidth: 100 }}
          />
        </Box>
        <Autocomplete
          multiple
          freeSolo
          options={tagOpts}
          value={tags}
          onChange={(_, v) => setTags(v)}
          slotProps={contentAreaAutocompleteSlotProps}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip variant="outlined" label={option} {...getTagProps({ index })} key={option} />
            ))
          }
          renderInput={(params) => <TextField {...params} label="Tags" margin="dense" fullWidth />}
        />
        <TextField
          label="Observações"
          multiline
          minRows={4}
          fullWidth
          margin="dense"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
        />
        <TextField
          select
          label="Tipo de pagamento"
          fullWidth
          margin="dense"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value)}
          SelectProps={contentAreaSelectProps}
        >
          <MenuItem value="">—</MenuItem>
          {PAYMENT_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ mt: 2 }}>
          <strong>Comprovante</strong>
          {receipts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1 }}>
              Nenhum comprovante anexado
            </Typography>
          ) : (
            <Stack spacing={0.5} sx={{ mt: 0.75, mb: 1.25 }}>
              {receipts.map((f) => (
                <Link
                  key={f.link_id || f.id}
                  href={api.fileDownloadUrl(f.id)}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                  sx={{ fontSize: 14, fontWeight: 600 }}
                >
                  {f.filename}
                </Link>
              ))}
            </Stack>
          )}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              mt: 1,
              width: '100%',
            }}
          >
            <Button variant="outlined" component="label" size="small">
              Arquivo
              <input
                type="file"
                hidden
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
            </Button>
            <Box
              component="span"
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: '0.85rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {receiptFile?.name || 'Nenhum selecionado'}
            </Box>
            <Button
              size="small"
              variant="contained"
              disabled={!receiptFile || busy}
              onClick={onUploadReceipt}
              sx={{ bgcolor: '#5a7a5b', flexShrink: 0, ml: 'auto' }}
            >
              Enviar/Pago
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={busy} onClick={onSave} sx={{ bgcolor: '#5a7a5b' }}>
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
