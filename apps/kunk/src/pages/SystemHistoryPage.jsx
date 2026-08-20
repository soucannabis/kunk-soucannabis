import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
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
  Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { createApiClient } from '@kunk/api-client';
import { useErrorModal } from '../components/errors/ErrorModalProvider.jsx';
import { getKunkPublicConfig } from '@kunk/config';
import { PATHS } from '../app/menuConfig.js';

const materialTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});

const GREEN = '#496b4c';
const PURPLE = '#705372';
const PURPLE_HOVER = '#5e4460';

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

const ACTION_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  { value: 'reception.created', label: 'Triagem criada' },
  { value: 'reception.status_changed', label: 'Status alterado' },
  { value: 'reception.assumed', label: 'Assumiu contato' },
  { value: 'reception.transferred', label: 'Transferência' },
  { value: 'reception.attendant_cleared', label: 'Removeu atendente' },
  { value: 'reception.linked', label: 'Linkou associado' },
  { value: 'reception.unlinked', label: 'Desvinculou associado' },
  { value: 'reception.completed', label: 'Concluiu triagem' },
];

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function pathForRow(row) {
  if (row.entity_type === 'reception' && row.entity_code) {
    return `${PATHS.triage}?t=${encodeURIComponent(row.entity_code)}`;
  }
  if (row.entity_type === 'reception') return PATHS.triage;
  return PATHS.systemHistory;
}

export default function SystemHistoryPage() {
  const navigate = useNavigate();
  const api = useMemo(() => {
    const bootstrap = getKunkPublicConfig();
    return createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' });
  }, []);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorModal();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (action) params.set('action', action);
      if (actor.trim()) params.set('actor_user_code', actor.trim());
      const res = await api.listActivity(params.toString());
      setRows(res.data || []);
      setTotal(res.meta?.filter_count ?? (res.data || []).length);
    } catch (err) {
      showError(err.message || 'Falha ao carregar histórico');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, action, actor, showError]);

  useEffect(() => {
    load();
  }, [load]);

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
              <HistoryRoundedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Sistema
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Histórico do sistema
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Acompanhe ações recentes de triagem e demais eventos registrados.
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
              sx={{ flex: 1 }}
            >
              <TextField
                select
                size="small"
                label="Ação"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                sx={{ ...fieldSx, minWidth: 220 }}
              >
                {ACTION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Código do ator"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                sx={{ ...fieldSx, minWidth: 220 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                variant="contained"
                startIcon={<FilterAltIcon />}
                onClick={load}
                sx={{
                  bgcolor: PURPLE,
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  boxShadow: '0 7px 18px rgba(112, 83, 114, 0.22)',
                  '&:hover': { bgcolor: PURPLE_HOVER },
                }}
              >
                Filtrar
              </Button>
            </Stack>
          </Stack>
          <Typography variant="body2" sx={{ mt: 2, color: '#657167' }}>
            {loading
              ? 'Carregando registros…'
              : `${total} registro${total === 1 ? '' : 's'}`}
          </Typography>
        </Paper>

        {loading ? (
          <Box
            sx={{
              py: 10,
              display: 'flex',
              justifyContent: 'center',
              bgcolor: '#fff',
              borderRadius: 3,
              border: '1px solid rgba(49, 67, 51, 0.1)',
            }}
          >
            <CircularProgress size={30} sx={{ color: GREEN }} />
          </Box>
        ) : (
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
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                  {['Data / hora', 'Usuário', 'Ação'].map((h) => (
                    <TableCell
                      key={h}
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
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ py: 8, borderBottom: 0 }}>
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
                          <HistoryRoundedIcon />
                        </Box>
                        <Typography fontWeight={700} color="#334235">
                          Nenhuma ação registrada
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={() => navigate(pathForRow(row))}
                      sx={{
                        cursor: 'pointer',
                        '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.55 },
                        '&:last-of-type td': { borderBottom: 0 },
                        '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                      }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap', color: '#536056' }}>
                        {formatWhen(row.date_created)}
                      </TableCell>
                      <TableCell sx={{ color: '#2f3d31', fontWeight: 650 }}>
                        {row.actor_name || '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#465348' }}>{row.summary}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </ThemeProvider>
  );
}
