import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import {
  contentAreaDialogProps,
  contentAreaSelectProps,
  displayName,
  isCompany,
  parseAnnotations,
  receiverDisplayName,
} from './institutionalStatus.js';
import PhoneField from '../../../components/PhoneField.jsx';

const GREEN = '#5a7a5b';

function Field({ label, value, onChange, ...rest }) {
  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export default function InstitutionalModal({
  open,
  client: initialClient,
  api,
  onClose,
  onChanged,
  onNewOrder,
}) {
  const [tab, setTab] = useState(0);
  const [client, setClient] = useState(initialClient);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState({ orders: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(async () => {
    if (!initialClient?.id && !initialClient?.client_code) return;
    setBusy(true);
    setMsg('');
    try {
      let c = initialClient;
      if (initialClient.client_code) {
        const res = await api.getInstitutionalClientByCode(initialClient.client_code);
        c = res.data || initialClient;
      } else if (initialClient.id) {
        const res = await api.getInstitutionalClient(initialClient.id);
        c = res.data || initialClient;
      }
      setClient(c);
      setForm({ ...c });
      if (c?.id) {
        const hRes = await api.getInstitutionalClientHistory(c.id);
        setHistory(hRes.data || { orders: [] });
      }
    } catch (err) {
      setMsg(err.message || 'Falha ao carregar');
    } finally {
      setBusy(false);
    }
  }, [api, initialClient]);

  useEffect(() => {
    if (open) {
      setTab(0);
      setConfirmDelete(false);
      reload();
    }
  }, [open, reload]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!client?.id) return;
    setBusy(true);
    setMsg('');
    try {
      const payload = { ...form };
      delete payload.id;
      delete payload.client_code;
      delete payload.display_name;
      delete payload.date_created;
      if (!payload.is_company) {
        payload.company_name = null;
        payload.company_trade_name = null;
        payload.company_cnpj = null;
        payload.company_email = null;
        payload.company_phone = null;
      }
      const res = await api.updateInstitutionalClient(client.id, payload);
      setClient(res.data);
      setForm(res.data);
      setMsg('Salvo');
      onChanged?.();
    } catch (err) {
      setMsg(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function addAnnotation() {
    if (!annotationText.trim() || !client?.id) return;
    const list = parseAnnotations(form.annotations);
    list.unshift({
      id: String(Date.now()),
      text: annotationText.trim(),
      date_created: new Date().toISOString(),
    });
    setAnnotationText('');
    setField('annotations', list);
    setBusy(true);
    try {
      const res = await api.updateInstitutionalClient(client.id, { annotations: list });
      setClient(res.data);
      setForm(res.data);
      onChanged?.();
    } catch (err) {
      setMsg(err.message || 'Falha ao salvar anotação');
    } finally {
      setBusy(false);
    }
  }

  async function removeClient() {
    if (!client?.id) return;
    setBusy(true);
    setMsg('');
    try {
      await api.deleteInstitutionalClient(client.id);
      onChanged?.();
      onClose();
    } catch (err) {
      setMsg(err.message || 'Falha ao excluir');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const company = isCompany(form);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth {...contentAreaDialogProps}>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6">{displayName(client)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {company ? 'Empresa' : 'Pessoa'} · Representante: {receiverDisplayName(client)}
            </Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            size="small"
            startIcon={<ShoppingCartIcon />}
            disabled={!client?.client_code}
            onClick={() => onNewOrder?.(client)}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
          >
            Novo pedido
          </Button>
          <Button size="small" color="error" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Excluir
          </Button>
        </Stack>

        {confirmDelete ? (
          <Box sx={{ mb: 2, p: 2, bgcolor: '#fff5f5', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Excluir este cliente institucional? Só é permitido se não houver pedidos.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" color="error" variant="contained" onClick={removeClient}>
                Confirmar exclusão
              </Button>
              <Button size="small" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </Stack>
          </Box>
        ) : null}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Dados" />
          <Tab label="Endereço" />
          <Tab label="Anotações" />
          <Tab label="Histórico" />
        </Tabs>

        {tab === 0 ? (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={company}
                  onChange={(e) => setField('is_company', e.target.checked)}
                  color="success"
                />
              }
              label="É uma empresa?"
              sx={{ mb: 2 }}
            />
            <TextField
              select
              size="small"
              label="Status"
              value={form.status || 'active'}
              onChange={(e) => setField('status', e.target.value)}
              SelectProps={contentAreaSelectProps}
              sx={{ mb: 2, minWidth: 160 }}
            >
              <MenuItem value="active">Ativo</MenuItem>
              <MenuItem value="inactive">Inativo</MenuItem>
            </TextField>

            {company ? (
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Field
                    label="Razão social"
                    value={form.company_name}
                    onChange={(v) => setField('company_name', v)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Field
                    label="Nome fantasia"
                    value={form.company_trade_name}
                    onChange={(v) => setField('company_trade_name', v)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Field
                    label="CNPJ"
                    value={form.company_cnpj}
                    onChange={(v) => setField('company_cnpj', v)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Field
                    label="E-mail empresa"
                    value={form.company_email}
                    onChange={(v) => setField('company_email', v)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <PhoneField
                    label="Telefone empresa"
                    name="company_phone"
                    value={form.company_phone}
                    onChange={(v) => setField('company_phone', v)}
                  />
                </Grid>
              </Grid>
            ) : null}

            <Typography variant="subtitle2" sx={{ mb: 1, color: GREEN }}>
              Representante
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <Field
                  label="Nome"
                  value={form.representative_name}
                  onChange={(v) => setField('representative_name', v)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Field
                  label="Sobrenome"
                  value={form.representative_last_name}
                  onChange={(v) => setField('representative_last_name', v)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Field
                  label="CPF"
                  value={form.representative_cpf}
                  onChange={(v) => setField('representative_cpf', v)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Field
                  label="E-mail"
                  value={form.representative_email}
                  onChange={(v) => setField('representative_email', v)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <PhoneField
                  label="Celular"
                  name="representative_mobile"
                  value={form.representative_mobile}
                  onChange={(v) => setField('representative_mobile', v)}
                />
              </Grid>
            </Grid>
          </Box>
        ) : null}

        {tab === 1 ? (
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={8}>
              <Field label="Rua" value={form.street} onChange={(v) => setField('street', v)} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Field
                label="Número"
                value={form.street_number}
                onChange={(v) => setField('street_number', v)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Field
                label="Complemento"
                value={form.complement}
                onChange={(v) => setField('complement', v)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Field
                label="Bairro"
                value={form.neighborhood}
                onChange={(v) => setField('neighborhood', v)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Field label="CEP" value={form.cep} onChange={(v) => setField('cep', v)} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <Field label="Cidade" value={form.city} onChange={(v) => setField('city', v)} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Field label="UF" value={form.state} onChange={(v) => setField('state', v)} />
            </Grid>
          </Grid>
        ) : null}

        {tab === 2 ? (
          <Box>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="Nova anotação"
                value={annotationText}
                onChange={(e) => setAnnotationText(e.target.value)}
              />
              <Button variant="contained" onClick={addAnnotation} sx={{ bgcolor: GREEN }}>
                Add
              </Button>
            </Stack>
            {parseAnnotations(form.annotations).map((a) => (
              <Box key={a.id || a.date_created} sx={{ mb: 1, p: 1, bgcolor: '#f7f7f7', borderRadius: 1 }}>
                <Typography variant="body2">{a.text}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.date_created ? new Date(a.date_created).toLocaleString('pt-BR') : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}

        {tab === 3 ? (
          <Box>
            {(history.orders || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nenhum pedido.
              </Typography>
            ) : (
              (history.orders || []).map((o) => (
                <Box key={o.id} sx={{ mb: 1, p: 1, borderBottom: '1px solid #eee' }}>
                  <Typography variant="body2" fontWeight={600}>
                    #{o.id} · {o.status} · R$ {Number(o.total || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {o.associate_name}
                    {o.receiver_name ? ` · Recebedor: ${o.receiver_name}` : ''}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        ) : null}

        {msg ? (
          <Typography
            variant="body2"
            color={msg === 'Salvo' ? 'success.main' : 'error'}
            sx={{ mt: 2 }}
          >
            {msg}
          </Typography>
        ) : null}
      </DialogContent>
      {tab === 0 || tab === 1 ? (
        <DialogActions>
          <Button onClick={onClose}>Fechar</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={save}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
          >
            Salvar
          </Button>
        </DialogActions>
      ) : (
        <DialogActions>
          <Button onClick={onClose}>Fechar</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
