import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../components/errors/ErrorModalProvider.jsx';
import PhoneField from '../components/PhoneField.jsx';
import { contentAreaDialogProps, contentAreaSelectProps } from '../layout/contentAreaOverlay.js';
import { typeLabel, resolvePriceFromType, normalizeProfessionalTypeId } from './reception/services/servicesUtils.js';

const muiTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});
const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    bgcolor: '#f8faf8',
    transition: 'background-color 160ms ease, box-shadow 160ms ease',
    '& fieldset': { borderColor: 'rgba(49, 67, 51, 0.14)' },
    '&:hover fieldset': { borderColor: 'rgba(73, 107, 76, 0.38)' },
    '&.Mui-focused': {
      bgcolor: '#fff',
      boxShadow: '0 0 0 3px rgba(73, 107, 76, 0.1)',
    },
  },
};

const EMPTY = {
  name: '',
  last_name: '',
  email: '',
  phone: '',
  cpf: '',
  state: '',
  city: '',
  type: '',
  specialty: '',
  consultation_price: '',
  is_collaborator: false,
  is_prescriber: false,
  active: true,
  calendar_id: '',
};

export default function ProfessionalsPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { showError } = useErrorModal();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [calendars, setCalendars] = useState([]);
  const [primaryId, setPrimaryId] = useState(null);
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [professionalTypes, setProfessionalTypes] = useState([]);
  const [inviteInfo, setInviteInfo] = useState(null);

  const typeOptions = useMemo(() => {
    return (professionalTypes || []).filter((t) => t.active !== false);
  }, [professionalTypes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { enrich_calendar: true, q: q || undefined };
      if (role === 'collaborators') params.role = 'collaborators';
      if (role === 'prescribers') params.role = 'prescribers';
      if (role === 'both') params.role = 'both';
      const res = await api.listProfessionals(params);
      setRows(res.data || []);
    } catch (err) {
      showError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, q, role, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [cals, status, typesRes] = await Promise.all([
          api.listGoogleCalendars().catch(() => ({ data: [] })),
          api.getGoogleCalendarStatus().catch(() => ({ data: {} })),
          api.getProfessionalTypes().catch(() => ({ data: [] })),
        ]);
        setCalendars(cals.data || []);
        setPrimaryId(status.data?.primary_calendar_id || null);
        setGoogleCalendarEnabled(Boolean(status.data?.enabled));
        setProfessionalTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
      } catch {
        /* module off */
        setGoogleCalendarEnabled(false);
      }
    })();
  }, [api]);

  function openNew() {
    const firstType = typeOptions[0]?.id || '';
    const typeCfg = professionalTypes.find((t) => t.id === firstType);
    setForm({
      ...EMPTY,
      type: firstType,
      consultation_price:
        typeCfg?.default_consultation_price != null ? String(typeCfg.default_consultation_price) : '',
    });
    setDialog({ mode: 'new' });
  }

  function openEdit(row) {
    const normalizedType =
      normalizeProfessionalTypeId(row.type) || typeOptions[0]?.id || '';
    setForm({
      name: row.name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      phone: row.phone || '',
      cpf: row.cpf || '',
      state: row.state || '',
      city: row.city || '',
      type: normalizedType,
      specialty: row.specialty || '',
      consultation_price: row.consultation_price ?? '',
      is_collaborator:
        row.is_collaborator === true ||
        String(row.is_collaborator).toLowerCase() === 'true' ||
        row.is_collaborator === 'Sim',
      is_prescriber:
        row.is_prescriber === true ||
        String(row.is_prescriber).toLowerCase() === 'true' ||
        row.is_prescriber === 'Sim',
      active: row.active !== 0 && row.active !== false,
      calendar_id: row.calendar_id || '',
    });
    setDialog({ mode: 'edit', id: row.id });
  }

  async function onSave() {
    setBusy(true);
    try {
      const body = {
        ...form,
        consultation_price:
          form.consultation_price === '' ? 0 : Number(form.consultation_price) || 0,
        active: form.active ? 1 : 0,
        calendar_id: googleCalendarEnabled ? form.calendar_id || null : null,
      };
      if (dialog.mode === 'new') await api.createProfessional(body);
      else await api.updateProfessional(dialog.id, body);
      setDialog(null);
      load();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete(row) {
    if (!window.confirm(`Desativar ${row.name}?`)) return;
    try {
      await api.deleteProfessional(row.id);
      load();
    } catch (err) {
      showError(err);
    }
  }

  async function onCreatePortalAccess(row, resend = false) {
    try {
      setBusy(true);
      const res = resend
        ? await api.resendProfessionalPortalAccess(row.id)
        : await api.createProfessionalPortalAccess(row.id);
      setInviteInfo({
        name: `${row.name || ''} ${row.last_name || ''}`.trim(),
        ...(res.data || {}),
      });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteInfo?.invite_url) return;
    try {
      await navigator.clipboard.writeText(inviteInfo.invite_url);
    } catch {
      /* ignore */
    }
  }

  const secondaryCalendars = calendars.filter((c) => c.id !== primaryId);

  return (
    <ThemeProvider theme={muiTheme}>
      <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', pb: 2 }}>
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            mb: 2,
            p: { xs: 2.5, md: 3.25 },
            color: '#fff',
            borderRadius: 3,
            background: 'linear-gradient(120deg, #314a34 0%, #496b4c 58%, #5d735e 100%)',
            boxShadow: '0 14px 36px rgba(27, 46, 30, 0.2)',
            '&::after': {
              content: '""',
              position: 'absolute',
              width: 230,
              height: 230,
              right: -55,
              top: -110,
              borderRadius: '50%',
              border: '42px solid rgba(255,255,255,0.06)',
            },
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 2.5,
                bgcolor: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <BadgeOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Equipe
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Profissionais
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Cadastre colaboradores, prescritores e vínculos de agenda.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Paper
          elevation={0}
          sx={{
            bgcolor: '#fff',
            border: '1px solid rgba(49, 67, 51, 0.1)',
            borderRadius: 3,
            p: { xs: 2, md: 2.5 },
            mb: 2,
            boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ flex: 1, minWidth: 0 }}
            >
              <TextField
                size="small"
                fullWidth
                placeholder="Buscar por nome"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ ...fieldSx, maxWidth: 320 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {[
                  ['all', 'Todos'],
                  ['collaborators', 'Colaboradores'],
                  ['prescribers', 'Prescritores'],
                  ['both', 'Ambos'],
                ].map(([id, label]) => (
                  <Chip
                    key={id}
                    label={label}
                    onClick={() => setRole(id)}
                    sx={{
                      fontWeight: 700,
                      bgcolor: role === id ? GREEN : 'rgba(73, 107, 76, 0.08)',
                      color: role === id ? '#fff' : GREEN,
                      '&:hover': {
                        bgcolor: role === id ? GREEN_HOVER : 'rgba(73, 107, 76, 0.14)',
                      },
                    }}
                  />
                ))}
              </Stack>
            </Stack>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={openNew}
              sx={{
                bgcolor: GREEN,
                borderRadius: 2.5,
                px: 2,
                textTransform: 'none',
                fontWeight: 700,
                boxShadow: '0 7px 18px rgba(73, 107, 76, 0.22)',
                '&:hover': { bgcolor: GREEN_HOVER, boxShadow: '0 9px 22px rgba(73, 107, 76, 0.28)' },
              }}
            >
              Novo profissional
            </Button>
          </Stack>
          <Typography variant="body2" sx={{ mt: 2, color: '#657167' }}>
            {loading
              ? 'Carregando profissionais…'
              : rows.length === 0
                ? 'Nenhum profissional encontrado'
                : `Exibindo ${rows.length} profissional${rows.length === 1 ? '' : 'is'}`}
          </Typography>
        </Paper>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid rgba(49, 67, 51, 0.1)',
            boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
            overflow: 'hidden',
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                {['Nome', 'Tipo', 'Papéis', 'Valor', ...(googleCalendarEnabled ? ['Agenda'] : []), 'Ativo', 'Ações'].map(
                  (h) => (
                    <TableCell
                      key={h}
                      align={h === 'Ações' ? 'center' : 'left'}
                      sx={{
                        color: '#627064',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderBottomColor: 'rgba(49, 67, 51, 0.1)',
                        py: 1.5,
                      }}
                    >
                      {h}
                    </TableCell>
                  )
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6 + (googleCalendarEnabled ? 1 : 0)}
                    sx={{ py: 8, borderBottom: 0 }}
                  >
                    <Stack alignItems="center" spacing={1.25}>
                      <CircularProgress size={30} sx={{ color: GREEN }} />
                      <Typography variant="body2" sx={{ color: GREEN, fontWeight: 600 }}>
                        Carregando profissionais…
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6 + (googleCalendarEnabled ? 1 : 0)}
                    sx={{ py: 8, borderBottom: 0 }}
                  >
                    <Stack alignItems="center" spacing={1.25}>
                      <Box
                        sx={{
                          width: 52,
                          height: 52,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: '50%',
                          bgcolor: 'rgba(73, 107, 76, 0.1)',
                          color: GREEN,
                        }}
                      >
                        <BadgeOutlinedIcon />
                      </Box>
                      <Typography fontWeight={700} color="#334235">
                        Nenhum profissional encontrado
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const collab =
                    row.is_collaborator === true ||
                    String(row.is_collaborator).toLowerCase() === 'true' ||
                    row.is_collaborator === 'Sim';
                  const presc =
                    row.is_prescriber === true ||
                    String(row.is_prescriber).toLowerCase() === 'true' ||
                    row.is_prescriber === 'Sim';
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{
                        '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.55 },
                        '&:last-of-type td': { borderBottom: 0 },
                        '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                      }}
                    >
                      <TableCell sx={{ color: '#2f3d31', fontWeight: 650 }}>
                        {row.name} {row.last_name}
                      </TableCell>
                      <TableCell sx={{ color: '#536056' }}>
                        {typeLabel(row.type, professionalTypes)}
                      </TableCell>
                      <TableCell>
                        {collab && (
                          <Chip
                            size="small"
                            label="Colaborador"
                            sx={{
                              mr: 0.5,
                              fontWeight: 600,
                              bgcolor: 'rgba(73, 107, 76, 0.12)',
                              color: GREEN,
                            }}
                          />
                        )}
                        {presc && (
                          <Chip
                            size="small"
                            label="Prescritor"
                            sx={{
                              fontWeight: 600,
                              bgcolor: 'rgba(112, 83, 114, 0.12)',
                              color: '#705372',
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ color: '#536056' }}>{row.consultation_price ?? '—'}</TableCell>
                      {googleCalendarEnabled ? (
                        <TableCell sx={{ color: '#536056' }}>
                          {row.calendar?.summary || row.calendar_id || '—'}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.active === 0 ? 'Não' : 'Sim'}
                          sx={{
                            fontWeight: 700,
                            bgcolor:
                              row.active === 0
                                ? 'rgba(180, 70, 70, 0.12)'
                                : 'rgba(73, 107, 76, 0.12)',
                            color: row.active === 0 ? '#8a5a5a' : GREEN,
                          }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ px: 1.5, verticalAlign: 'middle' }}>
                        <Stack direction="row" spacing={0.25} justifyContent="center" alignItems="center">
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => openEdit(row)} sx={{ color: GREEN }}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {collab ? (
                            <Tooltip title="Criar conta">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={busy}
                                  onClick={() => onCreatePortalAccess(row, false)}
                                  sx={{ color: '#705372' }}
                                >
                                  <PersonAddAlt1OutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                          {collab ? (
                            <Tooltip title="Reenviar convite">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={busy}
                                  onClick={() => onCreatePortalAccess(row, true)}
                                  sx={{ color: '#536056' }}
                                >
                                  <ForwardToInboxOutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                          <Tooltip title="Desativar">
                            <IconButton
                              size="small"
                              onClick={() => onSoftDelete(row)}
                              sx={{ color: '#8a5a5a' }}
                            >
                              <PersonOffOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
        <DialogTitle>{dialog?.mode === 'new' ? 'Novo profissional' : 'Editar profissional'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            <TextField
              label="Nome"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <TextField
              label="Sobrenome"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            />
            <TextField
              label="E-mail"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <PhoneField
              label="Telefone"
              name="phone"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            />
            <TextField
              select
              label="Tipo"
              value={form.type}
              disabled={!typeOptions.length}
              SelectProps={contentAreaSelectProps}
              helperText={
                typeOptions.length
                  ? 'Catálogo do Admin → Tipos de serviços'
                  : 'Nenhum tipo ativo no admin. Cadastre em Tipos de serviços.'
              }
              onChange={(e) => {
                const nextType = e.target.value;
                const cfg = professionalTypes.find((t) => t.id === nextType);
                setForm((f) => ({
                  ...f,
                  type: nextType,
                  consultation_price:
                    cfg?.default_consultation_price != null
                      ? String(cfg.default_consultation_price)
                      : f.consultation_price,
                }));
              }}
            >
              {typeOptions.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Valor consulta"
              type="number"
              value={form.consultation_price}
              onChange={(e) => setForm((f) => ({ ...f, consultation_price: e.target.value }))}
              helperText={
                resolvePriceFromType(form.type, professionalTypes) != null
                  ? `Padrão do tipo no admin: R$ ${resolvePriceFromType(form.type, professionalTypes)}`
                  : 'Sem preço padrão no tipo — usa este valor no create do serviço'
              }
            />
            {googleCalendarEnabled ? (
              <TextField
                select
                label="Agenda secundária (Google)"
                value={form.calendar_id}
                onChange={(e) => setForm((f) => ({ ...f, calendar_id: e.target.value }))}
                SelectProps={contentAreaSelectProps}
                helperText={
                  secondaryCalendars.length
                    ? 'Não use o calendário principal da associação'
                    : 'Configure Google Calendar em Serviços externos'
                }
              >
                <MenuItem value="">—</MenuItem>
                {secondaryCalendars.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.summary}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.is_collaborator}
                  onChange={(e) => setForm((f) => ({ ...f, is_collaborator: e.target.checked }))}
                />
              }
              label="Colaborador — mostrar em Atendimentos"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.is_prescriber}
                  onChange={(e) => setForm((f) => ({ ...f, is_prescriber: e.target.checked }))}
                />
              }
              label="Prescritor — receitas / pedidos"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
              }
              label="Ativo"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy} onClick={onSave} sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(inviteInfo)} onClose={() => setInviteInfo(null)} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
        <DialogTitle>Convite — {inviteInfo?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            E-mail automático ainda não configurado ({inviteInfo?.email_status || 'module_not_configured'}).
            Copie o link e envie ao profissional. Expira em{' '}
            {inviteInfo?.expires_at
              ? new Date(inviteInfo.expires_at).toLocaleString('pt-BR')
              : '—'}.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            value={inviteInfo?.invite_url || ''}
            InputProps={{ readOnly: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteInfo(null)}>Fechar</Button>
          <Button variant="contained" onClick={copyInviteLink} sx={{ bgcolor: GREEN }}>
            Copiar link
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
