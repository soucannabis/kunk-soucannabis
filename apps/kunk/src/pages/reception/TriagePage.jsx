import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Modal,
  Paper,
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
import CachedIcon from '@mui/icons-material/Cached';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AccessTimeFilledOutlinedIcon from '@mui/icons-material/AccessTimeFilledOutlined';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LinkIcon from '@mui/icons-material/Link';
import Fab from '@mui/material/Fab';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ScheduleIcon from '@mui/icons-material/Schedule';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PendingIcon from '@mui/icons-material/Pending';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import FlagIcon from '@mui/icons-material/Flag';
import StarIcon from '@mui/icons-material/Star';
import ChatIcon from '@mui/icons-material/Chat';
import MailIcon from '@mui/icons-material/Mail';
import PhoneIcon from '@mui/icons-material/Phone';
import InboxIcon from '@mui/icons-material/Inbox';
import SyncIcon from '@mui/icons-material/Sync';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BoyIcon from '@mui/icons-material/Boy';
import PersonIcon from '@mui/icons-material/Person';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import AvatarGroup from '@mui/material/AvatarGroup';
import { useOperatorAuth } from '@kunk/auth-session';
import { createApiClient } from '@kunk/api-client';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { useCacheConfig } from '../../lib/cache/CacheConfigProvider.jsx';
import { fetchAttendants } from '../../lib/cache/fetchers.js';
import { contentAreaModalProps } from '../../layout/contentAreaOverlay.js';
import {
  getEntryStatusValue,
  getKunkPublicConfig,
  getTriageDefaults,
  normalizeTriageStatuses,
} from '@kunk/config';
import { PATHS } from '../../app/menuConfig.js';

function calculateTime(dateString) {
  if (!dateString) return '—';
  const minutos = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (Number.isNaN(minutos) || minutos < 0) return '—';
  if (minutos >= 1440) {
    const dias = Math.floor(minutos / 1440);
    return `Há ${dias}d`;
  }
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    return `Há ${horas}h`;
  }
  return `Há ${minutos}m`;
}

function formatDateTo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  let digits = phoneNumber.toString().replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phoneNumber;
}

function contactName(row) {
  return (
    row.full_name
    || [row.name, row.last_name].filter(Boolean).join(' ').trim()
    || row.associate_name
    || 'Sem nome'
  );
}

const STATUS_ICON_MAP = {
  AccessTimeFilled: AccessTimeFilledIcon,
  AccessTime: AccessTimeIcon,
  Schedule: ScheduleIcon,
  HourglassEmpty: HourglassEmptyIcon,
  Pending: PendingIcon,
  PlayCircle: PlayCircleIcon,
  PauseCircle: PauseCircleIcon,
  CheckCircle: CheckCircleIcon,
  TaskAlt: TaskAltIcon,
  DoneAll: DoneAllIcon,
  Cancel: CancelIcon,
  Warning: WarningIcon,
  PriorityHigh: PriorityHighIcon,
  Flag: FlagIcon,
  Star: StarIcon,
  Person: PersonIcon,
  SupportAgent: SupportAgentIcon,
  Chat: ChatIcon,
  Mail: MailIcon,
  Phone: PhoneIcon,
  Inbox: InboxIcon,
  Sync: SyncIcon,
};

function statusIcon(status) {
  let Icon = STATUS_ICON_MAP[status?.icon];
  if (!Icon) {
    if (status?.is_default_entry) Icon = AccessTimeFilledIcon;
    else if (status?.is_terminal) Icon = CheckCircleIcon;
    else if (String(status?.label || '').toLowerCase().includes('conclu')) Icon = TaskAltIcon;
    else Icon = AccessTimeIcon;
  }
  const color = status?.color
    || (status?.is_default_entry ? '#7A5B7A' : undefined);
  return (
    <Icon
      sx={{
        mr: 1,
        fontSize: 18,
        ...(color ? { color } : { color: 'primary.main' }),
      }}
    />
  );
}

function customFieldEntries(row, triageConfig) {
  const values = row?.tags?.custom_fields || {};
  const defs = [...(triageConfig.formFields || []), ...(triageConfig.customFields || [])];
  return Object.entries(values).map(([id, value]) => {
    const def = defs.find((f) => f.id === id);
    return { id, label: def?.label || id, value };
  });
}

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
const PURPLE = '#705372';
const PURPLE_HOVER = '#5e4460';

const paperSx = {
  backgroundColor: '#fff',
  borderRadius: 3,
  border: '1px solid rgba(49, 67, 51, 0.1)',
  boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
  boxSizing: 'border-box',
};

function attendantDisplayName(att) {
  if (!att) return 'Atendente';
  return [att.name, att.last_name].filter(Boolean).join(' ').trim() || att.email || att.code || 'Atendente';
}

function myAttendantCode(user) {
  if (!user) return null;
  return user.user_code || user.internal_code || (user.id != null ? String(user.id) : null);
}

/** Material theme — TriagePage uses @mui/material inside Joy CssVarsProvider. */
const materialTheme = createTheme({
  palette: {
    primary: { main: GREEN },
    secondary: { main: PURPLE },
  },
  typography: {
    fontFamily: 'inherit',
  },
  shape: {
    borderRadius: 12,
  },
});

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

export default function TriagePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCode = searchParams.get('t');
  const { user: loggedUser } = useOperatorAuth();
  const { enabled: cacheEnabled } = useCacheConfig();
  const myCode = useMemo(() => myAttendantCode(loggedUser), [loggedUser]);

  const api = useMemo(() => {
    const bootstrap = getKunkPublicConfig();
    return createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' });
  }, []);

  const [triageConfig, setTriageConfig] = useState(getTriageDefaults());
  const [statusFilter, setStatusFilter] = useState(() => getEntryStatusValue());
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorModal();
  const [busyId, setBusyId] = useState(null);
  const [attendantBusyId, setAttendantBusyId] = useState(null);

  const [attendants, setAttendants] = useState([]);
  const [selectedAttendantFilters, setSelectedAttendantFilters] = useState([]);

  const [actionMenu, setActionMenu] = useState({ anchor: null, row: null });
  const [statusSubMenu, setStatusSubMenu] = useState(null);
  const [transferMenu, setTransferMenu] = useState({ anchor: null, row: null });

  const [linkRow, setLinkRow] = useState(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [linkBusy, setLinkBusy] = useState(false);

  const [docsRow, setDocsRow] = useState(null);
  const [docsUser, setDocsUser] = useState(null);
  const [docsFiles, setDocsFiles] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [utalkEnabled, setUtalkEnabled] = useState(false);
  const [utalkSyncBusyId, setUtalkSyncBusyId] = useState(null);
  const [utalkBulkBusy, setUtalkBulkBusy] = useState(false);
  const [chatModal, setChatModal] = useState({ open: false, row: null, value: '' });
  const [chatBusy, setChatBusy] = useState(false);

  const statuses = useMemo(
    () => (triageConfig.statuses || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    [triageConfig.statuses],
  );

  const activeStatus = statuses.some((s) => s.value === statusFilter)
    ? statusFilter
    : getEntryStatusValue(statuses);

  const attendantsByCode = useMemo(() => {
    const map = {};
    for (const a of attendants) {
      if (a.code) map[a.code] = a;
      if (a.user_code) map[a.user_code] = a;
      if (a.internal_code) map[a.internal_code] = a;
    }
    return map;
  }, [attendants]);

  const filteredRows = useMemo(() => {
    if (!selectedAttendantFilters.length) return rows;
    return rows.filter((r) => r.attendant && selectedAttendantFilters.includes(String(r.attendant)));
  }, [rows, selectedAttendantFilters]);

  const uniqueRowAttendants = useMemo(() => {
    const list = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row.attendant || seen.has(String(row.attendant))) continue;
      seen.add(String(row.attendant));
      list.push(attendantsByCode[row.attendant] || { code: row.attendant, name: row.attendant });
    }
    return list;
  }, [rows, attendantsByCode]);

  const loadConfig = useCallback(async () => {
    try {
      const schema = await api.receptionFormSchema();
      const defaults = getTriageDefaults();
      const next = {
        formFields: schema.data?.form_fields || defaults.formFields,
        customFields: schema.data?.custom_fields || defaults.customFields,
        statuses: normalizeTriageStatuses(schema.data?.statuses || defaults.statuses),
        associateDocs: Boolean(schema.data?.associate_docs),
        publicFormEnabled: schema.data?.enabled !== false,
      };
      setTriageConfig(next);
      setStatusFilter((prev) => {
        const list = next.statuses || [];
        if (list.some((s) => s.value === prev)) return prev;
        return getEntryStatusValue(list);
      });
    } catch {
      /* keep defaults */
    }
  }, [api]);

  const loadAttendants = useCallback(async () => {
    try {
      const list = await fetchAttendants(api, cacheEnabled);
      setAttendants(list);
    } catch {
      setAttendants([]);
    }
  }, [api, cacheEnabled]);

  const loadUtalkStatus = useCallback(async () => {
    try {
      const res = await api.getUtalkStatus();
      setUtalkEnabled(
        Boolean(res.data?.enabled && res.data?.has_api_token && res.data?.has_organization_id)
      );
    } catch {
      setUtalkEnabled(false);
    }
  }, [api]);

  const notifyUtalkSideEffect = useCallback((payload) => {
    const u = payload?.utalk;
    if (!u) return;
    if (u.ok === false && !u.skipped) {
      showError(u.message || 'Falha ao sincronizar atendente no Utalk');
    } else if (u.skipped && u.code === 'UTALK_ID_MISSING') {
      showError(u.message || 'Operador sem utalk_id — cadastre no Admin → Utalk');
    }
  }, [showError]);

  const loadCounts = useCallback(async () => {
    const res = await api.receptionStatusCounts();
    setCounts(res.data || {});
  }, [api]);

  const loadRows = useCallback(async (status, q) => {
    const params = new URLSearchParams({
      sort: '-date_created',
      limit: '100',
      meta: 'filter_count',
    });
    if (deepLinkCode) {
      params.set('filter', JSON.stringify({ code: { _eq: deepLinkCode } }));
    } else {
      params.set('filter', JSON.stringify({ status: { _eq: status } }));
    }
    if (q && q.trim()) params.set('search', q.trim());
    const res = await api.listItems('reception', params.toString());
    setRows(res.data || []);
  }, [api, deepLinkCode]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCounts(), loadRows(activeStatus, searchQuery), loadAttendants()]);
    } catch (err) {
      showError(err.message || 'Falha ao carregar triagem');
    } finally {
      setLoading(false);
    }
  }, [loadCounts, loadRows, loadAttendants, activeStatus, searchQuery, showError]);

  useEffect(() => {
    loadConfig();
    loadAttendants();
    loadUtalkStatus();
  }, [loadConfig, loadAttendants, loadUtalkStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeStatus(row, status) {
    setStatusSubMenu(null);
    setActionMenu({ anchor: null, row: null });
    setBusyId(row.id);
    try {
      await api.updateReceptionStatus(row.id, status);
      await refresh();
    } catch (err) {
      showError(err.message || 'Falha ao atualizar status');
    } finally {
      setBusyId(null);
    }
  }

  function closeActionMenus() {
    setStatusSubMenu(null);
    setActionMenu({ anchor: null, row: null });
  }

  async function assumeContact(row) {
    if (!myCode) {
      showError('Não foi possível identificar o usuário logado');
      return;
    }
    setAttendantBusyId(row.id);
    try {
      const res = await api.assignReceptionAttendant(row.id, myCode);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendant: myCode } : r)));
      notifyUtalkSideEffect(res.data);
    } catch (err) {
      showError(err.message || 'Falha ao assumir contato');
    } finally {
      setAttendantBusyId(null);
    }
  }

  async function transferContact(row, attendantCode) {
    setTransferMenu({ anchor: null, row: null });
    if (!attendantCode) return;
    setAttendantBusyId(row.id);
    try {
      const res = await api.assignReceptionAttendant(row.id, attendantCode);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendant: attendantCode } : r)));
      notifyUtalkSideEffect(res.data);
    } catch (err) {
      showError(err.message || 'Falha ao transferir contato');
    } finally {
      setAttendantBusyId(null);
    }
  }

  async function clearAttendant(row) {
    setAttendantBusyId(row.id);
    try {
      const res = await api.clearReceptionAttendant(row.id);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, attendant: null } : r)));
      notifyUtalkSideEffect(res.data);
    } catch (err) {
      showError(err.message || 'Falha ao remover atendente');
    } finally {
      setAttendantBusyId(null);
    }
  }

  async function syncUtalkRow(row) {
    if (!row?.chat_id) return;
    setUtalkSyncBusyId(row.id);
    try {
      const res = await api.syncReceptionUtalk(row.id);
      const next = res.data?.reception;
      if (next) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...next } : r)));
      }
      if (res.data?.utalk?.unknown_member) {
        showError('Membro Utalk do chat não corresponde a nenhum operador com utalk_id');
      }
    } catch (err) {
      showError(err.message || 'Falha ao sincronizar Utalk');
    } finally {
      setUtalkSyncBusyId(null);
    }
  }

  async function syncUtalkWaitingBulk() {
    if (utalkBulkBusy) return;
    setUtalkBulkBusy(true);
    try {
      const res = await api.syncReceptionUtalkWaiting({});
      const d = res.data || {};
      await refresh();
      if (d.failed) {
        showError(`Utalk: ${d.updated || 0} atualizado(s), ${d.failed} falha(s)`);
      }
    } catch (err) {
      showError(err.message || 'Falha no sync Utalk em espera');
    } finally {
      setUtalkBulkBusy(false);
    }
  }

  async function saveChatId() {
    const row = chatModal.row;
    if (!row) return;
    setChatBusy(true);
    try {
      const value = String(chatModal.value || '').trim() || null;
      const res = await api.setReceptionChatId(row.id, value);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, chat_id: res.data?.chat_id ?? value } : r))
      );
      setChatModal({ open: false, row: null, value: '' });
    } catch (err) {
      showError(err.message || 'Falha ao vincular chat Utalk');
    } finally {
      setChatBusy(false);
    }
  }

  function openUtalkChat(row) {
    if (!row?.chat_id) return;
    window.open(`https://app-utalk.umbler.com/chats/${encodeURIComponent(row.chat_id)}`, '_blank', 'noopener,noreferrer');
  }

  function toggleAttendantFilter(code) {
    setSelectedAttendantFilters((prev) => (
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    ));
  }

  async function goToOrderOrService(row, kind) {
    closeActionMenus();
    if (!row.associate_code) return;
    setBusyId(row.id);
    try {
      // ?u= deve ser users.user_code — não aceitar LEAD/códigos de atendimento
      const userRes = await api.getUserByCode(row.associate_code);
      const userCode = userRes.data?.user_code;
      if (!userCode) {
        throw new Error('Associado vinculado sem user_code');
      }
      await api.completeReception(row.id, kind === 'order' ? 'Pedido' : 'Serviço');
      // Legado: Pedido → /app/loja/novo-pedido?u= ; Serviço → /app/acolhimento/servicos?u=
      const path = kind === 'order' ? PATHS.newOrder : PATHS.services;
      navigate(`${path}?u=${encodeURIComponent(userCode)}`);
    } catch (err) {
      const notFound =
        err.status === 404 ||
        err.code === 'NOT_FOUND' ||
        /não encontrado/i.test(err.message || '');
      showError(
        notFound
          ? 'Vínculo inválido. Associe um usuário cadastrado (código do usuário) antes de abrir pedido/serviço.'
          : err.message || 'Falha ao concluir contato'
      );
      setBusyId(null);
    }
  }

  async function unlink(row) {
    setBusyId(row.id);
    try {
      await api.unlinkReceptionAssociate(row.id);
      await refresh();
    } catch (err) {
      showError(err.message || 'Falha ao desvincular');
    } finally {
      setBusyId(null);
    }
  }

  async function searchAssociates(q) {
    setLinkQuery(q);
    if (!q || q.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    try {
      const res = await api.searchUsers(q.trim());
      setLinkResults(res.data || []);
    } catch {
      setLinkResults([]);
    }
  }

  async function confirmLink(user) {
    if (!linkRow || !user?.user_code) return;
    setLinkBusy(true);
    try {
      await api.linkReceptionAssociate(linkRow.id, user.user_code);
      setLinkRow(null);
      setLinkQuery('');
      setLinkResults([]);
      await refresh();
    } catch (err) {
      showError(err.message || 'Falha ao vincular');
    } finally {
      setLinkBusy(false);
    }
  }

  async function openDocs(row) {
    if (!row.associate_code) return;
    setDocsRow(row);
    setDocsLoading(true);
    setDocsUser(null);
    setDocsFiles([]);
    try {
      const userRes = await api.get(`/users/by-code/${encodeURIComponent(row.associate_code)}`);
      setDocsUser(userRes.data || null);
      if (userRes.data?.id) {
        const linkRes = await api.listItems(
          'users_files',
          new URLSearchParams({
            filter: JSON.stringify({ user_id: { _eq: userRes.data.id } }),
            limit: '50',
          }).toString(),
        );
        const fileIds = (linkRes.data || []).map((x) => x.file_id).filter(Boolean);
        const files = [];
        for (const fileId of fileIds.slice(0, 20)) {
          try {
            const f = await api.getFile(fileId);
            if (f.data) files.push(f.data);
          } catch {
            /* skip */
          }
        }
        setDocsFiles(files);
      }
    } catch (err) {
      showError(err.message || 'Falha ao carregar dados do associado');
    } finally {
      setDocsLoading(false);
    }
  }

  return (
    <ThemeProvider theme={materialTheme}>
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
            <AccessTimeFilledOutlinedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
            >
              Acolhimento
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
              Gestão de triagem
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
              Organize a fila de contatos, assuma atendimentos e avance cada jornada.
            </Typography>
          </Box>
        </Stack>
      </Box>

    <Box sx={{ width: '100%', minWidth: 0 }}>
        {deepLinkCode ? (
          <Paper
            elevation={0}
            sx={{
              ...paperSx,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
              mb: 2,
              px: 2.5,
              py: 1.5,
              bgcolor: 'rgba(112, 83, 114, 0.1)',
              borderColor: 'rgba(112, 83, 114, 0.2)',
            }}
          >
            <Typography variant="body2" sx={{ color: PURPLE_HOVER, fontWeight: 600 }}>
              Exibindo 1 contato (filtro por código)
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('t');
                setSearchParams(next, { replace: true });
              }}
              sx={{
                bgcolor: PURPLE,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                '&:hover': { bgcolor: PURPLE_HOVER },
              }}
            >
              Ver todas
            </Button>
          </Paper>
        ) : null}

        <Paper elevation={0} sx={{ ...paperSx, p: { xs: 2, md: 2.5 }, mb: 2 }}>
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
                placeholder="Nome, e-mail ou telefone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') refresh();
                }}
                sx={{ ...fieldSx, maxWidth: 420 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        onClick={refresh}
                        sx={{ color: GREEN, minWidth: 0, fontWeight: 700, textTransform: 'none' }}
                      >
                        Buscar
                      </Button>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                select
                size="small"
                label="Status"
                value={activeStatus}
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ ...fieldSx, minWidth: 180 }}
              >
                {statuses.map((st) => (
                  <MenuItem key={st.value} value={st.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {statusIcon(st)}
                      <span style={{ flex: 1 }}>{st.label}</span>
                      <Chip
                        label={counts[st.value] ?? 0}
                        size="small"
                        sx={{
                          ml: 1,
                          height: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          bgcolor: activeStatus === st.value ? 'rgba(112, 83, 114, 0.14)' : '#eef2ef',
                          color: activeStatus === st.value ? PURPLE : '#526354',
                        }}
                      />
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
              <AvatarGroup max={10} sx={{ '& .MuiAvatar-root': { width: 36, height: 36, fontSize: 13 } }}>
                {uniqueRowAttendants.map((att) => {
                  const code = String(att.code);
                  const selected = selectedAttendantFilters.includes(code);
                  return (
                    <Tooltip key={code} title={attendantDisplayName(att)}>
                      <Avatar
                        src={att.avatar_url || undefined}
                        alt={attendantDisplayName(att)}
                        onClick={() => toggleAttendantFilter(code)}
                        sx={{
                          cursor: 'pointer',
                          border: selected ? `2px solid ${GREEN}` : '2px solid transparent',
                          opacity: selectedAttendantFilters.length === 0 || selected ? 1 : 0.4,
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </AvatarGroup>
              {selectedAttendantFilters.length > 0 ? (
                <IconButton
                  onClick={() => setSelectedAttendantFilters([])}
                  size="small"
                  aria-label="Limpar filtro de atendentes"
                  sx={{
                    border: '1px solid rgba(49, 67, 51, 0.14)',
                    borderRadius: 2.5,
                    color: '#526354',
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
              <Chip
                label={`${filteredRows.length} contato${filteredRows.length === 1 ? '' : 's'} na fila`}
                sx={{
                  bgcolor: 'rgba(73, 107, 76, 0.1)',
                  color: GREEN,
                  fontWeight: 700,
                }}
              />
              <Tooltip title="Atualizar lista">
                <IconButton
                  onClick={refresh}
                  disabled={loading}
                  sx={{
                    color: '#526354',
                    border: '1px solid rgba(49, 67, 51, 0.14)',
                    borderRadius: 2.5,
                    '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
                  }}
                >
                  {loading ? <CircularProgress size={18} sx={{ color: GREEN }} /> : <RefreshRoundedIcon />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Paper>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            bgcolor: 'transparent',
            backgroundImage: 'none',
            boxShadow: 'none',
            border: 'none',
            borderRadius: 0,
            px: 0,
            pt: 0.5,
            pb: 1.5,
            overflowX: { xs: 'auto', md: 'visible' },
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <Table
            sx={{
              tableLayout: 'fixed',
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: '0 12px',
            }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                <TableCell
                  sx={{
                    color: '#627064',
                    width: '38%',
                    pl: 3,
                    py: 1.5,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderBottom: 0,
                    borderTopLeftRadius: 12,
                    borderBottomLeftRadius: 12,
                  }}
                >
                  Contato
                </TableCell>
                <TableCell
                  sx={{
                    color: '#627064',
                    width: '62%',
                    py: 1.5,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderBottom: 0,
                    borderTopRightRadius: 12,
                    borderBottomRightRadius: 12,
                  }}
                >
                  Mensagem
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell align="center" colSpan={2} sx={{ py: 8, borderBottom: 0 }}>
                    <Box sx={{ width: '100%', maxWidth: 360, mx: 'auto' }}>
                      <LinearProgress
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'rgba(255, 255, 255, 0.3)',
                          '& .MuiLinearProgress-bar': { bgcolor: '#fff' },
                        }}
                      />
                      <Typography variant="body2" sx={{ mt: 1.5, color: '#fff', fontWeight: 600 }}>
                        Carregando dados...
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell align="center" colSpan={2} sx={{ py: 8, borderBottom: 0 }}>
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
                        <InboxIcon />
                      </Box>
                      <Typography fontWeight={700} color="#334235">
                        Nenhum contato neste status
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ajuste os filtros ou aguarde novos contatos na fila.
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : null}

              {filteredRows.map((row) => {
                const linked = Boolean(row.associate_code);
                const customs = customFieldEntries(row, triageConfig);
                const busy = busyId === row.id;
                const attendantBusy = attendantBusyId === row.id;
                const rowAttendant = row.attendant ? attendantsByCode[row.attendant] : null;
                const highlighted = deepLinkCode
                  && row.code
                  && String(row.code).trim() === String(deepLinkCode).trim();

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      id={row.code ? `reception-row-code-${row.code}` : undefined}
                      sx={{
                        bgcolor: highlighted ? 'rgba(112, 83, 114, 0.1)' : '#fff',
                        boxShadow: '0 4px 18px rgba(34, 53, 36, 0.06)',
                        outline: highlighted ? `2px solid ${PURPLE}` : '1px solid rgba(49, 67, 51, 0.1)',
                        outlineOffset: -1,
                        '&:hover': {
                          bgcolor: highlighted
                            ? 'rgba(112, 83, 114, 0.14)'
                            : '#f7faf7',
                        },
                        '& td': {
                          borderBottom: 0,
                          verticalAlign: 'top',
                          bgcolor: 'inherit',
                        },
                        '& td:first-of-type': {
                          borderTopLeftRadius: 12,
                          borderBottomLeftRadius: 12,
                        },
                        '& td:last-of-type': {
                          borderTopRightRadius: 12,
                          borderBottomRightRadius: 12,
                        },
                      }}
                    >
                      <TableCell
                        sx={{
                          width: '38%',
                          py: 2.5,
                          pl: 3,
                          pr: 2,
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'baseline',
                            gap: 1,
                            mb: 1,
                            width: 'fit-content',
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700, m: 0 }}>
                            {calculateTime(row.date_created)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: GREEN, m: 0 }}>
                            {formatDateTo(row.date_created)}
                          </Typography>
                        </Box>

                        <Typography
                          component="div"
                          sx={{ fontSize: 12, fontWeight: 400, color: '#829084', mb: 0.35 }}
                        >
                          Nome
                        </Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 1.5 }}>
                          {contactName(row)}
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <MailIcon sx={{ fontSize: 16, color: GREEN, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 14, wordBreak: 'break-word' }}>
                              {row.email || '—'}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <PhoneIcon sx={{ fontSize: 16, color: GREEN, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 14 }}>
                              {formatPhoneNumber(row.phone) || '—'}
                            </Typography>
                          </Box>
                        </Box>
                        {linked ? (
                          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1.25 }}>
                            <Chip
                              icon={<PersonIcon sx={{ color: 'white !important' }} />}
                              label={(
                                (() => {
                                  const name = String(row.associate_name || '').trim() || 'Associado';
                                  return name.length > 22 ? `${name.slice(0, 22)}...` : name;
                                })()
                              )}
                              onDelete={() => unlink(row)}
                              deleteIcon={<LinkOffIcon sx={{ color: 'white !important' }} />}
                              size="small"
                              sx={{
                                backgroundColor: '#1976d2',
                                color: 'white',
                                height: 'auto',
                                maxWidth: '100%',
                                '& .MuiChip-label': {
                                  fontSize: 12,
                                  fontWeight: 700,
                                  px: 1,
                                  py: 0.35,
                                  overflow: 'hidden',
                                },
                              }}
                            />
                          </Box>
                        ) : null}
                        {row.patient_name ? (
                          <Box sx={{ mt: 1.25 }}>
                            <Typography
                              component="div"
                              sx={{ fontSize: 12, fontWeight: 400, color: '#829084', mb: 0.35 }}
                            >
                              Paciente
                            </Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                              {row.patient_name}
                            </Typography>
                          </Box>
                        ) : null}
                      </TableCell>

                      <TableCell
                        sx={{
                          width: '62%',
                          py: 2.5,
                          pr: 8,
                          position: 'relative',
                        }}
                      >
                        <Box sx={{ display: 'grid', gap: 1.25 }}>
                          {row.help_topic ? (
                            <Box>
                              <Typography
                                component="div"
                                sx={{ fontSize: 12, fontWeight: 400, color: '#829084', mb: 0.35 }}
                              >
                                Como podemos ajudar?
                              </Typography>
                              <Typography sx={{ fontSize: 16 }}>{row.help_topic}</Typography>
                            </Box>
                          ) : null}
                          <Box>
                            <Typography
                              component="div"
                              sx={{ fontSize: 12, fontWeight: 400, color: '#829084', mb: 0.35 }}
                            >
                              Motivo
                            </Typography>
                            <Typography sx={{ fontSize: 16 }}>{row.message || '—'}</Typography>
                          </Box>
                        </Box>

                        {customs.length ? (
                          <Box sx={{ mt: 1.5, display: 'grid', gap: 0.25 }}>
                            <Typography variant="caption" sx={{ color: '#829084', fontWeight: 700 }}>
                              Campos personalizados
                            </Typography>
                            {customs.map((c) => (
                              <Typography key={c.id} variant="caption">
                                <strong>{c.label}:</strong> {String(c.value)}
                              </Typography>
                            ))}
                          </Box>
                        ) : null}

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            marginTop: '32px',
                            gap: 1,
                            flexWrap: 'wrap',
                            pr: 1,
                          }}
                        >
                          {utalkEnabled && !row.chat_id ? (
                            <Button
                              variant="outlined"
                              size="small"
                              sx={{ color: '#1976d2', borderColor: '#1976d2' }}
                              onClick={() => setChatModal({ open: true, row, value: '' })}
                              disabled={busy}
                            >
                              Linkar com Utalk
                            </Button>
                          ) : (
                            <>
                              <Tooltip title="Assumir o contato">
                                <span>
                                  <IconButton
                                    onClick={() => assumeContact(row)}
                                    disabled={attendantBusy || busy || !myCode}
                                    aria-label="Assumir o contato"
                                  >
                                    {attendantBusy ? (
                                      <CircularProgress size={22} color="primary" />
                                    ) : (
                                      <SupportAgentIcon color="primary" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Transferir contato">
                                <span>
                                  <IconButton
                                    onClick={(e) => setTransferMenu({ anchor: e.currentTarget, row })}
                                    disabled={attendantBusy || busy}
                                    aria-label="Transferir contato"
                                  >
                                    <GroupIcon color="primary" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              {utalkEnabled && row.chat_id ? (
                                <>
                                  <Tooltip title="Ver no Utalk">
                                    <IconButton
                                      onClick={() => openUtalkChat(row)}
                                      color="success"
                                      aria-label="Ver no Utalk"
                                    >
                                      <WhatsAppIcon />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Sincronizar atendente com Utalk">
                                    <span>
                                      <IconButton
                                        onClick={() => syncUtalkRow(row)}
                                        disabled={busy || utalkSyncBusyId === row.id || attendantBusy}
                                        aria-label="Sincronizar atendente Utalk"
                                        sx={{
                                          color: '#1976d2',
                                          border: '1px solid #1976d2',
                                          borderRadius: 1,
                                          p: 0.75,
                                        }}
                                      >
                                        {utalkSyncBusyId === row.id ? (
                                          <CircularProgress size={18} color="inherit" />
                                        ) : (
                                          <CachedIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Alterar chat Utalk">
                                    <IconButton
                                      onClick={() =>
                                        setChatModal({ open: true, row, value: row.chat_id || '' })
                                      }
                                      aria-label="Alterar chat Utalk"
                                    >
                                      <LinkIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              ) : null}
                              {row.attendant ? (
                                <Chip
                                  avatar={(
                                    <Avatar
                                      src={rowAttendant?.avatar_url || undefined}
                                      alt={attendantDisplayName(rowAttendant) || row.attendant}
                                    />
                                  )}
                                  label={attendantDisplayName(rowAttendant) || row.attendant}
                                  onDelete={attendantBusy ? undefined : () => clearAttendant(row)}
                                  deleteIcon={<DeleteIcon />}
                                  sx={{
                                    alignSelf: 'center',
                                    height: 32,
                                    backgroundColor: '#1976d2',
                                    color: 'white',
                                    fontSize: '12px',
                                    '& .MuiChip-deleteIcon': {
                                      color: 'white',
                                      '&:hover': { color: 'rgba(255,255,255,0.8)' },
                                    },
                                  }}
                                />
                              ) : (
                                <Chip
                                  label="Sem atendente"
                                  size="small"
                                  sx={{
                                    alignSelf: 'center',
                                    height: 32,
                                    bgcolor: '#f5f5f5',
                                    border: '1px solid #e0e0e0',
                                    fontSize: 12,
                                  }}
                                />
                              )}
                            </>
                          )}
                          {triageConfig.associateDocs && linked ? (
                            <Tooltip title="Documentos / dados">
                              <IconButton size="small" onClick={() => openDocs(row)} sx={{ color: PURPLE }}>
                                <DescriptionOutlinedIcon />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                        </Box>

                        <Button
                            onClick={(e) => setActionMenu({ anchor: e.currentTarget, row })}
                            disabled={busy}
                            aria-label="Ações de pedido e atendimento"
                            endIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />}
                            startIcon={<MoreHorizRoundedIcon sx={{ fontSize: 18 }} />}
                            sx={{
                              position: 'absolute',
                              right: 16,
                              bottom: 16,
                              minWidth: 0,
                              px: 1.5,
                              py: 0.75,
                              borderRadius: 999,
                              textTransform: 'none',
                              fontWeight: 700,
                              fontSize: '0.8125rem',
                              letterSpacing: '0.01em',
                              color: '#fff',
                              bgcolor: GREEN,
                              border: '1px solid rgba(255,255,255,0.12)',
                              boxShadow: '0 8px 20px rgba(73, 107, 76, 0.28)',
                              backdropFilter: 'blur(6px)',
                              transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
                              '&:hover': {
                                bgcolor: GREEN_HOVER,
                                boxShadow: '0 10px 24px rgba(73, 107, 76, 0.34)',
                                transform: 'translateY(-1px)',
                              },
                              '&.Mui-disabled': {
                                bgcolor: 'rgba(73, 107, 76, 0.35)',
                                color: 'rgba(255,255,255,0.75)',
                              },
                            }}
                          >
                            Ações
                          </Button>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
    </Box>

      <Menu
        anchorEl={actionMenu.anchor}
        open={Boolean(actionMenu.anchor)}
        onClose={closeActionMenus}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: -0.5,
            minWidth: 220,
            borderRadius: 2.5,
            border: '1px solid rgba(49, 67, 51, 0.1)',
            boxShadow: '0 16px 40px rgba(31, 44, 33, 0.16)',
            overflow: 'hidden',
            '& .MuiMenuItem-root': {
              py: 1.1,
              px: 1.5,
              gap: 1.25,
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#2f3d31',
              '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
            },
          },
        }}
      >
        <MenuItem
          onClick={(e) => setStatusSubMenu(e.currentTarget)}
          sx={{ justifyContent: 'space-between' }}
        >
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
            <FlagOutlinedIcon fontSize="small" sx={{ color: PURPLE }} />
            Status
          </Box>
          <ChevronRightRoundedIcon sx={{ fontSize: 18, color: '#829084' }} />
        </MenuItem>
        {actionMenu.row?.associate_code ? (
          [
            <MenuItem
              key="service"
              onClick={() => goToOrderOrService(actionMenu.row, 'service')}
            >
              <CalendarMonthIcon fontSize="small" sx={{ color: GREEN }} />
              Atendimento
            </MenuItem>,
            <MenuItem
              key="order"
              onClick={() => goToOrderOrService(actionMenu.row, 'order')}
            >
              <ShoppingCartCheckoutIcon fontSize="small" sx={{ color: GREEN }} />
              Pedido
            </MenuItem>,
            <MenuItem
              key="unlink"
              onClick={() => {
                const row = actionMenu.row;
                closeActionMenus();
                if (row) unlink(row);
              }}
            >
              <LinkOffIcon fontSize="small" sx={{ color: '#8a5a5a' }} />
              Desvincular associado
            </MenuItem>,
          ]
        ) : (
          <MenuItem
            onClick={() => {
              setLinkRow(actionMenu.row);
              closeActionMenus();
            }}
          >
            <BoyIcon fontSize="small" sx={{ color: PURPLE }} />
            Linkar a um Associado
          </MenuItem>
        )}
      </Menu>

      <Menu
        anchorEl={statusSubMenu}
        open={Boolean(statusSubMenu)}
        onClose={() => setStatusSubMenu(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ml: 0.5,
            minWidth: 200,
            borderRadius: 2.5,
            border: '1px solid rgba(49, 67, 51, 0.1)',
            boxShadow: '0 16px 40px rgba(31, 44, 33, 0.16)',
          },
        }}
      >
        {statuses.map((s) => (
          <MenuItem
            key={s.value}
            selected={actionMenu.row?.status === s.value}
            onClick={() => actionMenu.row && changeStatus(actionMenu.row, s.value)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: actionMenu.row?.status === s.value ? '#7A5B7A' : 'inherit',
              fontWeight: actionMenu.row?.status === s.value ? 'bold' : 'normal',
            }}
          >
            {statusIcon(s)}
            <span style={{ fontSize: 13 }}>{s.label}</span>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={transferMenu.anchor}
        open={Boolean(transferMenu.anchor)}
        onClose={() => setTransferMenu({ anchor: null, row: null })}
      >
        {attendants.length === 0 ? (
          <MenuItem disabled>Nenhum atendente disponível</MenuItem>
        ) : (
          [...attendants]
            .sort((a, b) => {
              const au = a.utalk_id ? 0 : 1;
              const bu = b.utalk_id ? 0 : 1;
              if (au !== bu) return au - bu;
              return attendantDisplayName(a).localeCompare(attendantDisplayName(b), 'pt-BR');
            })
            .map((att) => (
            <MenuItem
              key={att.code}
              selected={transferMenu.row?.attendant === att.code}
              disabled={transferMenu.row?.attendant === att.code}
              onClick={() => transferContact(transferMenu.row, att.code)}
            >
              <Avatar src={att.avatar_url || undefined} sx={{ width: 32, height: 32, mr: 1 }} />
              {attendantDisplayName(att)}
              {!att.utalk_id ? (
                <Typography component="span" sx={{ ml: 1, fontSize: 11, color: '#999' }}>
                  sem utalk_id
                </Typography>
              ) : null}
            </MenuItem>
          ))
        )}
      </Menu>

      <Modal open={Boolean(linkRow)} onClose={() => setLinkRow(null)} {...contentAreaModalProps}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#fff',
            borderRadius: '16px',
            p: 3,
            width: 'min(520px, 92vw)',
            outline: 'none',
          }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>Linkar associado</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
            {linkRow ? contactName(linkRow) : ''}
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Buscar por nome, e-mail, CPF…"
            value={linkQuery}
            onChange={(e) => searchAssociates(e.target.value)}
            autoFocus
          />
          <Box sx={{ maxHeight: 280, overflow: 'auto', mt: 1.5, display: 'grid', gap: 0.5 }}>
            {linkResults.map((u) => {
              const name = [u.associate_name, u.associate_last_name].filter(Boolean).join(' ')
                || u.fullname
                || 'Sem nome';
              const email = u.email_account || '—';
              return (
                <Button
                  key={u.id}
                  variant="outlined"
                  disabled={linkBusy}
                  onClick={() => confirmLink(u)}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    py: 1,
                  }}
                >
                  <Typography component="span" sx={{ fontWeight: 600, fontSize: 14 }}>
                    {name}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 12, color: '#666' }}>
                    {email}
                  </Typography>
                </Button>
              );
            })}
            {linkQuery.length >= 2 && linkResults.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#777' }}>Nenhum resultado</Typography>
            ) : null}
          </Box>
        </Box>
      </Modal>

      <Modal open={Boolean(docsRow)} onClose={() => setDocsRow(null)} {...contentAreaModalProps}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#fff',
            borderRadius: '16px',
            p: 3,
            width: 'min(560px, 92vw)',
            outline: 'none',
          }}
        >
          <Typography variant="h6">Dados do associado</Typography>
          {docsLoading ? <CircularProgress sx={{ my: 2 }} /> : null}
          {!docsLoading && docsUser ? (
            <Box sx={{ display: 'grid', gap: 0.5, mt: 1 }}>
              <Typography variant="body2">
                <strong>Nome:</strong>{' '}
                {[docsUser.associate_name, docsUser.associate_last_name].filter(Boolean).join(' ') || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>E-mail:</strong> {docsUser.email_account || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Telefone:</strong> {docsUser.mobile_number || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Código:</strong> {docsUser.user_code || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Status:</strong> {docsUser.status || '—'}
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Arquivos</Typography>
              {docsFiles.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#777' }}>Nenhum arquivo</Typography>
              ) : (
                docsFiles.map((f) => (
                  <Typography key={f.id} variant="body2">
                    {f.filename || f.title || f.id}
                  </Typography>
                ))
              )}
            </Box>
          ) : null}
        </Box>
      </Modal>

      <Modal
        open={chatModal.open}
        onClose={() => !chatBusy && setChatModal({ open: false, row: null, value: '' })}
        {...contentAreaModalProps}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: '#fff',
            borderRadius: '16px',
            p: 3,
            width: 'min(440px, 92vw)',
            outline: 'none',
          }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>Linkar com Utalk</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
            Cole o Chat ID do Umbler Utalk para vincular a este contato.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Chat ID do Utalk"
            value={chatModal.value}
            onChange={(e) => setChatModal((prev) => ({ ...prev, value: e.target.value }))}
            autoFocus
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
            <Button
              onClick={() => setChatModal({ open: false, row: null, value: '' })}
              disabled={chatBusy}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              sx={{ bgcolor: '#1976d2' }}
              onClick={saveChatId}
              disabled={chatBusy || !String(chatModal.value || '').trim()}
            >
              {chatBusy ? 'Salvando…' : 'Salvar'}
            </Button>
          </Box>
        </Box>
      </Modal>

      {utalkEnabled && activeStatus === getEntryStatusValue(statuses) ? (
        <Fab
          color="success"
          aria-label="Sincronizar Utalk em espera"
          onClick={syncUtalkWaitingBulk}
          disabled={utalkBulkBusy}
          sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 20 }}
        >
          {utalkBulkBusy ? <CircularProgress size={24} color="inherit" /> : <SyncIcon />}
        </Fab>
      ) : null}
    </Box>
    </ThemeProvider>
  );
}
