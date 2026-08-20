import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Select,
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
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EventIcon from '@mui/icons-material/Event';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PaymentIcon from '@mui/icons-material/Payment';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { invalidateServicesCache } from '../../lib/cache/fetchers.js';
import NewServiceModal from './services/NewServiceModal.jsx';
import ServiceInfoModal from './services/ServiceInfoModal.jsx';
import PaymentModal from '../../components/PaymentModal.jsx';
import { contentAreaDialogProps } from '../../layout/contentAreaOverlay.js';
import {
  buildServicesListQuery,
  DEFAULT_PAGE_SIZE,
  formatMoney,
  formatTags,
  PAGE_SIZE_OPTIONS,
  STATUS_AWAITING,
  STATUS_PAID,
  normalizeServiceStatus,
} from './services/servicesUtils.js';

const muiTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: {
    fontFamily: 'inherit',
  },
  shape: {
    borderRadius: 12,
  },
});
const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
const PURPLE = '#705372';

const TABLE_HEADERS = [
  { key: 'criacao', label: 'Criação', width: '10%' },
  { key: 'associado', label: 'Associado', width: '18%' },
  { key: 'profissional', label: 'Profissional', width: '16%' },
  { key: 'consulta', label: 'Consulta', width: '10%' },
  { key: 'doacao', label: 'Doação', width: '9%' },
  { key: 'valor', label: 'Valor', width: '9%' },
  { key: 'tags', label: 'Tags', width: '10%' },
  { key: 'status', label: 'Status', width: '10%' },
  { key: 'acoes', label: 'Ações', width: '8%' },
];

const cellEllipsisSx = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 0,
};

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

function splitDateTime(v) {
  if (!v) return { date: '—', time: '' };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: String(v), time: '' };
  return {
    date: d.toLocaleDateString('pt-BR'),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function DateTimeStack({ value, color = '#536056', emphasize = false }) {
  const { date, time } = splitDateTime(value);
  return (
    <Box sx={{ lineHeight: 1.2, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={{
          color: emphasize ? '#2f3d31' : color,
          fontWeight: emphasize ? 650 : 500,
          whiteSpace: 'nowrap',
        }}
      >
        {date}
      </Typography>
      {time ? (
        <Typography variant="caption" sx={{ color: '#829084', display: 'block', whiteSpace: 'nowrap' }}>
          {time}
        </Typography>
      ) : null}
    </Box>
  );
}

function eventOpenUrl(row) {
  if (!hasRealCalendarEvent(row)) return null;
  if (row?.event_link) return row.event_link;
  if (row?.event_id) {
    return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(row.event_id)}`;
  }
  return null;
}

/** Seed/demo IDs não contam como evento Google real. */
function hasRealCalendarEvent(row) {
  const id = row?.event_id != null ? String(row.event_id).trim() : '';
  if (!id) return false;
  if (/^evt-demo/i.test(id)) return false;
  const link = row?.event_link != null ? String(row.event_link) : '';
  if (link.includes('meet.demo.kunk.local')) return false;
  return true;
}

export default function ServicesPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { showError } = useErrorModal();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState(searchParams.get('s') || '');
  const [search, setSearch] = useState(searchParams.get('s') || '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showOnlyPaid, setShowOnlyPaid] = useState(null);
  const [newOpen, setNewOpen] = useState(Boolean(searchParams.get('u')));
  const [infoService, setInfoService] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(null);
  const [highlightIso, setHighlightIso] = useState(() => searchParams.get('h') || '');
  const [eventMenu, setEventMenu] = useState(null); // { anchorEl, row }
  const [pagarmeForServices, setPagarmeForServices] = useState(false);
  const [paymentService, setPaymentService] = useState(null);
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);

  const totalPages = Math.max(1, Math.ceil((Number(totalCount) || 0) / pageSize) || 1);
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const paidFilterLabel =
    showOnlyPaid === true ? 'Somente pagos' : showOnlyPaid === false ? 'Somente pendentes' : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getPagarmeStatus();
        if (!cancelled) {
          setPagarmeForServices(Boolean(res.data?.enabled && res.data?.use_for_services));
        }
      } catch {
        if (!cancelled) setPagarmeForServices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getGoogleCalendarStatus();
        if (!cancelled) setGoogleCalendarEnabled(Boolean(res.data?.enabled));
      } catch {
        if (!cancelled) setGoogleCalendarEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildServicesListQuery({
        page,
        pageSize,
        search,
        dateFrom,
        dateTo,
        showOnlyPaid,
      });
      const res = await api.listServices(qs);
      const data = res.data || [];
      setRows(data);
      const metaCount = res.meta?.filter_count;
      setTotalCount(typeof metaCount === 'number' ? metaCount : data.length);
    } catch (err) {
      showError(err);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize, search, dateFrom, dateTo, showOnlyPaid, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleSearchSubmit(e) {
    e?.preventDefault?.();
    setPage(1);
    setSearch(String(searchInput || '').trim());
  }

  function handlePageSizeChange(nextSize) {
    setPageSize(nextSize);
    setPage(1);
  }

  function handleDateFromChange(value) {
    setPage(1);
    setDateFrom(value);
  }

  function handleDateToChange(value) {
    setPage(1);
    setDateTo(value);
  }

  function handlePaidFilterToggle(target) {
    setPage(1);
    setShowOnlyPaid((v) => (v === target ? null : target));
  }

  async function toggleStatus(row) {
    const current = normalizeServiceStatus(row.status);
    const next = current === STATUS_PAID ? STATUS_AWAITING : STATUS_PAID;
    try {
      await api.updateService(row.id, { status: next });
      invalidateServicesCache();
      load();
    } catch (err) {
      showError(err);
    }
  }

  async function onSchedule(row) {
    try {
      const res = await api.scheduleService(row.id);
      const updated = res?.data || {};
      invalidateServicesCache();
      await load();
      const link = updated.event_link || eventOpenUrl(updated);
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      showError(err);
    }
  }

  function openEventMenu(event, row) {
    setEventMenu({ anchorEl: event.currentTarget, row });
  }

  function closeEventMenu() {
    setEventMenu(null);
  }

  function openExistingEvent() {
    const row = eventMenu?.row;
    closeEventMenu();
    const link = eventOpenUrl(row);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  async function cancelExistingEvent() {
    const row = eventMenu?.row;
    closeEventMenu();
    if (!row?.id) return;
    if (
      !window.confirm(
        'Cancelar o evento no Google Calendar?\n\nO serviço permanece; apenas o agendamento na agenda é removido.'
      )
    ) {
      return;
    }
    try {
      await api.unscheduleService(row.id);
      invalidateServicesCache();
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function onDelete(row) {
    if (!window.confirm('Excluir este serviço?')) return;
    try {
      await api.deleteService(row.id);
      invalidateServicesCache();
      load();
    } catch (err) {
      showError(err);
    }
  }

  async function applyDateChange(row, newDate, replace) {
    try {
      await api.updateService(row.id, {
        consultation_date: newDate || null,
        replace_calendar_event: replace,
      });
      setEditDate(null);
      setConfirmReplace(null);
      invalidateServicesCache();
      load();
    } catch (err) {
      if (err.code === 'EVENT_DATE_CONFIRMATION_REQUIRED') {
        setConfirmReplace({ row, newDate });
        return;
      }
      showError(err);
    }
  }

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
              <CalendarMonthRoundedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Acolhimento
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Gestão de atendimentos
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Acompanhe consultas, pagamentos e agendamentos dos associados.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Box
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
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', lg: 'center' }}
            justifyContent="space-between"
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', md: 'center' }}
              sx={{ flex: 1, minWidth: 0 }}
            >
              <Box
                component="form"
                onSubmit={handleSearchSubmit}
                sx={{ flex: 1, maxWidth: 420, minWidth: { xs: 0, md: 240 } }}
              >
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Associado ou profissional"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  sx={fieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button
                          type="submit"
                          size="small"
                          sx={{ color: GREEN, minWidth: 0, fontWeight: 700, textTransform: 'none' }}
                        >
                          Buscar
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <TextField
                size="small"
                type="date"
                label="Data inicial"
                InputLabelProps={{ shrink: true }}
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                sx={{ ...fieldSx, minWidth: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="Data final"
                InputLabelProps={{ shrink: true }}
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                sx={{ ...fieldSx, minWidth: 150 }}
              />
            </Stack>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
              flexWrap="wrap"
              useFlexGap
            >
              <Tooltip title="Somente pagos">
                <IconButton
                  onClick={() => handlePaidFilterToggle(true)}
                  sx={{
                    color: showOnlyPaid === true ? '#fff' : GREEN,
                    bgcolor: showOnlyPaid === true ? GREEN : 'transparent',
                    border: '1px solid',
                    borderColor: showOnlyPaid === true ? GREEN : 'rgba(49, 67, 51, 0.14)',
                    borderRadius: 2.5,
                    '&:hover': {
                      bgcolor: showOnlyPaid === true ? GREEN_HOVER : 'rgba(73, 107, 76, 0.08)',
                    },
                  }}
                >
                  <CheckCircleIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Somente pendentes">
                <IconButton
                  onClick={() => handlePaidFilterToggle(false)}
                  sx={{
                    color: showOnlyPaid === false ? '#fff' : PURPLE,
                    bgcolor: showOnlyPaid === false ? PURPLE : 'transparent',
                    border: '1px solid',
                    borderColor: showOnlyPaid === false ? PURPLE : 'rgba(112, 83, 114, 0.3)',
                    borderRadius: 2.5,
                    '&:hover': {
                      bgcolor: showOnlyPaid === false ? '#5e4460' : 'rgba(112, 83, 114, 0.06)',
                    },
                  }}
                >
                  <AccessTimeIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Atualizar lista">
                <IconButton
                  onClick={() => load()}
                  sx={{
                    color: '#526354',
                    border: '1px solid rgba(49, 67, 51, 0.14)',
                    borderRadius: 2.5,
                    '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
                  }}
                >
                  <RefreshRoundedIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={() => setNewOpen(true)}
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
                Novo Atendimento
              </Button>
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{ mt: 2 }}
          >
            <Typography variant="body2" sx={{ color: '#657167' }}>
              {totalCount === 0
                ? 'Nenhum atendimento encontrado'
                : `Exibindo ${from}–${to} de ${totalCount} atendimento${totalCount === 1 ? '' : 's'}`}
            </Typography>
            {paidFilterLabel ? (
              <Chip
                size="small"
                label={paidFilterLabel}
                onDelete={() => setShowOnlyPaid(null)}
                sx={{
                  bgcolor: 'rgba(112, 83, 114, 0.1)',
                  color: '#5e4460',
                  fontWeight: 600,
                  '& .MuiChip-deleteIcon': { color: '#705372' },
                }}
              />
            ) : null}
          </Stack>
        </Box>

        {loading ? (
          <Box
            sx={{
              py: 10,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: 3,
              border: '1px solid rgba(49, 67, 51, 0.1)',
            }}
          >
            <CircularProgress size={30} sx={{ color: GREEN }} />
          </Box>
        ) : (
          <>
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                borderRadius: 3,
                border: '1px solid rgba(49, 67, 51, 0.1)',
                boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
                // hidden: corta o thead no radius do bloco (md+ usava overflow visible e “quadrava” o topo)
                overflow: 'hidden',
                overflowX: { xs: 'auto', md: 'hidden' },
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              <Table
                size="small"
                sx={{
                  width: '100%',
                  tableLayout: 'fixed',
                  minWidth: { xs: 1080, md: 'unset' },
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  '& .MuiTableHead-root .MuiTableRow-root .MuiTableCell-root:first-of-type': {
                    borderTopLeftRadius: 12,
                  },
                  '& .MuiTableHead-root .MuiTableRow-root .MuiTableCell-root:last-of-type': {
                    borderTopRightRadius: 12,
                  },
                }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                    {TABLE_HEADERS.map((h) => (
                      <TableCell
                        key={h.key}
                        align={h.key === 'acoes' ? 'center' : 'left'}
                        sx={{
                          width: h.width,
                          color: '#627064',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          borderBottomColor: 'rgba(49, 67, 51, 0.1)',
                          py: 1.5,
                          whiteSpace: 'nowrap',
                          ...(h.key === 'acoes' ? { px: 1.5 } : null),
                          ...(h.key === 'status' ? { px: 1.25 } : null),
                        }}
                      >
                        {h.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={TABLE_HEADERS.length} sx={{ py: 8, borderBottom: 0 }}>
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
                            <EventAvailableOutlinedIcon />
                          </Box>
                          <Typography fontWeight={700} color="#334235">
                            Nenhum atendimento encontrado
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Ajuste os filtros ou cadastre um novo atendimento.
                          </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const rowIso = row.consultation_date || row.date_created;
                      let highlighted = false;
                      if (highlightIso && rowIso) {
                        try {
                          highlighted =
                            Math.abs(new Date(rowIso).getTime() - new Date(highlightIso).getTime()) <
                            60_000;
                        } catch {
                          highlighted = false;
                        }
                      }
                      const status = normalizeServiceStatus(row.status);
                      const isPaid = status === STATUS_PAID;
                      const statusLabel = isPaid ? 'Pago' : 'Pendente';
                      return (
                        <TableRow
                          key={row.id}
                          hover
                          data-highlight={highlighted ? '1' : undefined}
                          sx={{
                            bgcolor: highlighted ? 'rgba(112, 83, 114, 0.12)' : undefined,
                            '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.55 },
                            '&:last-of-type td': { borderBottom: 0 },
                            '&:hover': {
                              bgcolor: highlighted
                                ? 'rgba(112, 83, 114, 0.16)'
                                : 'rgba(73, 107, 76, 0.035)',
                            },
                          }}
                        >
                          <TableCell sx={{ verticalAlign: 'middle' }}>
                            <DateTimeStack value={row.date_created} color="#667168" />
                          </TableCell>
                          <TableCell
                            title={row.associate_name || ''}
                            sx={{ color: '#2f3d31', fontWeight: 650, ...cellEllipsisSx }}
                          >
                            {row.associate_name || '—'}
                          </TableCell>
                          <TableCell
                            title={row.professional_name || ''}
                            sx={{ color: '#536056', ...cellEllipsisSx }}
                          >
                            {row.professional_name || '—'}
                          </TableCell>
                          <TableCell
                            sx={{
                              cursor: 'pointer',
                              verticalAlign: 'middle',
                              '&:hover .MuiTypography-body2': { color: GREEN },
                            }}
                            onClick={() =>
                              setEditDate({
                                row,
                                value: row.consultation_date
                                  ? new Date(row.consultation_date).toISOString().slice(0, 16)
                                  : '',
                              })
                            }
                          >
                            <DateTimeStack value={row.consultation_date} emphasize />
                          </TableCell>
                          <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                            {formatMoney(row.donation)}
                          </TableCell>
                          <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                            {formatMoney(row.price)}
                          </TableCell>
                          <TableCell
                            title={formatTags(row.tags)}
                            sx={{ color: '#536056', ...cellEllipsisSx }}
                          >
                            {formatTags(row.tags)}
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'middle', px: 1.25 }}>
                            <Chip
                              size="small"
                              label={statusLabel}
                              onClick={() => toggleStatus(row)}
                              icon={
                                isPaid ? (
                                  <CheckCircleIcon sx={{ fontSize: '16px !important' }} />
                                ) : (
                                  <AccessTimeIcon sx={{ fontSize: '16px !important' }} />
                                )
                              }
                              title={status || STATUS_AWAITING}
                              sx={{
                                height: 26,
                                fontWeight: 700,
                                bgcolor: isPaid ? 'rgba(73, 107, 76, 0.12)' : 'rgba(112, 83, 114, 0.12)',
                                color: isPaid ? GREEN : PURPLE,
                                cursor: 'pointer',
                                '& .MuiChip-icon': { color: 'inherit' },
                                '&:hover': {
                                  bgcolor: isPaid ? 'rgba(73, 107, 76, 0.18)' : 'rgba(112, 83, 114, 0.18)',
                                },
                              }}
                            />
                          </TableCell>
                          <TableCell
                            align="center"
                            sx={{
                              verticalAlign: 'middle',
                              px: 1.5,
                            }}
                          >
                            <Stack spacing={0.35} alignItems="center">
                              {pagarmeForServices &&
                                status === STATUS_AWAITING &&
                                Number(row.price_paid || row.price || 0) > 0 && (
                                  <Tooltip title="Pagamento Pagar.me">
                                    <IconButton
                                      size="small"
                                      data-testid={`service-pay-${row.id}`}
                                      onClick={() => setPaymentService(row)}
                                      sx={{ color: PURPLE }}
                                    >
                                      <PaymentIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              {googleCalendarEnabled ? (
                                <Tooltip
                                  title={
                                    hasRealCalendarEvent(row)
                                      ? 'Evento agendado — abrir ou cancelar'
                                      : 'Agendar no Google Calendar'
                                  }
                                >
                                  <IconButton
                                    size="small"
                                    data-testid={
                                      hasRealCalendarEvent(row)
                                        ? 'service-event-open'
                                        : 'service-event-schedule'
                                    }
                                    onClick={(e) => {
                                      if (hasRealCalendarEvent(row)) openEventMenu(e, row);
                                      else onSchedule(row);
                                    }}
                                    sx={{
                                      color: hasRealCalendarEvent(row) ? GREEN : '#667168',
                                      '&:hover': hasRealCalendarEvent(row)
                                        ? { color: GREEN_HOVER, bgcolor: 'rgba(73,107,76,0.12)' }
                                        : undefined,
                                    }}
                                  >
                                    <EventIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                              <Tooltip title="Info">
                                <IconButton
                                  size="small"
                                  data-testid="service-info"
                                  onClick={() => setInfoService(row)}
                                  sx={{ color: PURPLE }}
                                >
                                  <InfoOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Excluir">
                                <IconButton
                                  size="small"
                                  onClick={() => onDelete(row)}
                                  sx={{ color: '#8a5a5a' }}
                                >
                                  <DeleteOutlineRoundedIcon fontSize="small" />
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

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: { xs: 'center', sm: 'space-between' },
                gap: 1.5,
                flexWrap: 'wrap',
                mt: 2,
                mb: 1,
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                bgcolor: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(49, 67, 51, 0.1)',
                borderRadius: 2.5,
                boxShadow: '0 6px 22px rgba(34, 53, 36, 0.05)',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ color: '#6a766c' }}>
                  Itens por página
                </Typography>
                <FormControl size="small" sx={{ minWidth: 72 }}>
                  <Select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      borderRadius: 2,
                      '& .MuiSelect-select': { py: 0.75 },
                    }}
                    MenuProps={{
                      PaperProps: { sx: { maxHeight: 280 } },
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <MenuItem key={n} value={n}>
                        {n}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <IconButton
                  size="small"
                  aria-label="Página anterior"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  sx={{
                    border: '1px solid rgba(49, 67, 51, 0.14)',
                    borderRadius: 2,
                    color: GREEN,
                    '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
                  }}
                >
                  <ChevronLeftRoundedIcon />
                </IconButton>
                <Typography variant="body2" sx={{ minWidth: 120, textAlign: 'center', color: '#465348' }}>
                  Página <strong>{page}</strong> de {totalPages}
                </Typography>
                <IconButton
                  size="small"
                  aria-label="Próxima página"
                  disabled={page >= totalPages || totalCount === 0}
                  onClick={() => {
                    setPage((p) => p + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  sx={{
                    borderRadius: 2,
                    color: '#fff',
                    bgcolor: GREEN,
                    '&:hover': { bgcolor: GREEN_HOVER },
                    '&.Mui-disabled': { color: '#aab3ab', bgcolor: '#edf0ed' },
                  }}
                >
                  <ChevronRightRoundedIcon />
                </IconButton>
              </Stack>
            </Box>
          </>
        )}
      </Box>

      <NewServiceModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        api={api}
        initialUserCode={searchParams.get('u')}
        onCreated={() => {
          invalidateServicesCache();
          load();
        }}
      />
      <ServiceInfoModal
        open={Boolean(infoService)}
        service={infoService}
        api={api}
        onClose={() => setInfoService(null)}
        onSaved={() => {
          invalidateServicesCache();
          load();
        }}
      />

      <Menu
        anchorEl={eventMenu?.anchorEl || null}
        open={Boolean(eventMenu?.anchorEl)}
        onClose={closeEventMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={openExistingEvent} data-testid="service-event-open-link">
          <ListItemIcon>
            <OpenInNewIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Abrir no Google Calendar</ListItemText>
        </MenuItem>
        <MenuItem onClick={cancelExistingEvent} data-testid="service-event-cancel">
          <ListItemIcon>
            <EventBusyIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ color: 'error' }}>
            Cancelar evento
          </ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(editDate)} onClose={() => setEditDate(null)} {...contentAreaDialogProps}>
        <DialogTitle>Editar data</DialogTitle>
        <DialogContent>
          <TextField
            type="datetime-local"
            fullWidth
            margin="dense"
            InputLabelProps={{ shrink: true }}
            value={editDate?.value || ''}
            onChange={(e) => setEditDate((d) => ({ ...d, value: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDate(null)}>Cancelar</Button>
          <Button
            variant="contained"
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
            onClick={() =>
              applyDateChange(editDate.row, editDate.value || null, false)
            }
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmReplace)} onClose={() => setConfirmReplace(null)} {...contentAreaDialogProps}>
        <DialogTitle>Alterar data do evento</DialogTitle>
        <DialogContent>
          Este serviço já possui um evento no calendário. Excluir o evento antigo e criar um novo
          com a nova data?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReplace(null)}>Cancelar</Button>
          <Button
            variant="contained"
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
            onClick={() =>
              applyDateChange(confirmReplace.row, confirmReplace.newDate, true)
            }
          >
            Aprovar
          </Button>
        </DialogActions>
      </Dialog>

      <PaymentModal
        open={Boolean(paymentService)}
        onClose={() => setPaymentService(null)}
        api={api}
        context="service"
        entity={paymentService}
        onSuccess={() => load()}
      />
    </ThemeProvider>
  );
}
