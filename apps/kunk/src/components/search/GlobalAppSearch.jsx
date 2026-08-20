import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import AccessTimeFilledOutlinedIcon from '@mui/icons-material/AccessTimeFilledOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { PATHS } from '../../app/menuConfig.js';
import { GLOBAL_SEARCH_Z } from '../../layout/contentAreaOverlay.js';

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
const PURPLE = '#705372';
const PURPLE_HOVER = '#5e4460';

const muiTheme = createTheme({
  palette: {
    primary: { main: GREEN },
    secondary: { main: PURPLE },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});

const Z = GLOBAL_SEARCH_Z;

const ENTITY_API = {
  associados: 'users',
  pedidos: 'orders',
  servicos: 'services',
  triagem: 'reception',
};

const TAB_OPTIONS = [
  { key: 'associados', label: 'Associados', icon: PersonOutlineRoundedIcon },
  { key: 'pedidos', label: 'Pedidos', icon: ShoppingCartOutlinedIcon },
  { key: 'servicos', label: 'Atendimentos', icon: EventAvailableOutlinedIcon },
  { key: 'triagem', label: 'Triagem', icon: AccessTimeFilledOutlinedIcon },
];

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

const headerCellSx = {
  color: '#627064',
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  bgcolor: '#f4f7f4',
  borderBottomColor: 'rgba(49, 67, 51, 0.1)',
  py: 1.35,
  whiteSpace: 'nowrap',
};

function formatDate(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return String(v);
  }
}

function displayNameTitleCase(str) {
  if (str == null) return '';
  return String(str)
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w) =>
      w
        .split('-')
        .map((p) => (p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1) : p))
        .join('-')
    )
    .join(' ');
}

function openFullUrl(pathWithQuery) {
  const url = pathWithQuery.startsWith('http')
    ? pathWithQuery
    : `${window.location.origin}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function associadoNomeCell(row) {
  const blocks = Array.isArray(row.gs_meta?.display_name_blocks) ? row.gs_meta.display_name_blocks : [];
  if (blocks.length > 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {blocks.map((b, i) => (
          <Box key={i}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontSize: 11, color: '#657167', letterSpacing: '0.04em' }}
            >
              {b.label}
            </Typography>
            <Typography variant="body2" sx={{ color: '#2f3d31', fontWeight: 650 }}>
              {b.name ? displayNameTitleCase(b.name) : '—'}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }
  const name =
    row.fullname ||
    [row.associate_name, row.associate_last_name].filter(Boolean).join(' ') ||
    '';
  return (
    <Typography variant="body2" sx={{ color: '#2f3d31', fontWeight: 650 }}>
      {name ? displayNameTitleCase(name) : '—'}
    </Typography>
  );
}

export default function GlobalAppSearch() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('associados');
  const [ordersMode, setOrdersMode] = useState('name');
  const [qInput, setQInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);

  const runSearch = useCallback(
    async (opts = {}) => {
      const queryText = opts.q != null ? opts.q : qInput;
      const pageNum = opts.page != null ? opts.page : 1;
      if (!String(queryText).trim()) {
        setError('Informe um termo para pesquisar.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await api.globalSearch({
          entity: ENTITY_API[tab],
          q: String(queryText).trim(),
          page: pageNum,
          limit: 100,
          ordersMode: tab === 'pedidos' ? ordersMode : undefined,
        });
        setRows(res.data || []);
        setMeta(res.meta || null);
        setPage(pageNum);
      } catch (e) {
        setError(e.message || 'Erro na pesquisa.');
        setRows([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [api, qInput, tab, ordersMode]
  );

  function goOrderOrService(row, kind) {
    const code = row.gs_meta?.open_user_code || row.user_code;
    if (!code) return;
    const path = kind === 'order' ? PATHS.newOrder : PATHS.services;
    openFullUrl(`${path}?u=${encodeURIComponent(code)}`);
    setOpen(false);
  }

  async function sendTriage(row) {
    const code = row.gs_meta?.open_user_code || row.user_code;
    if (!code) return;
    try {
      const name = row.associate_name || row.fullname || 'Associado';
      await api.createReception({
        name: String(name).split(' ')[0] || 'Associado',
        last_name: row.associate_last_name || '',
        email: row.gs_meta?.display_email || row.email_account || null,
        phone: row.gs_meta?.display_phone || row.mobile_number || null,
        is_associate: true,
        associate_code: code,
        associate_name: name,
      });
      openFullUrl(PATHS.triage);
      setOpen(false);
    } catch (e) {
      setError(e.message || 'Falha ao criar triagem');
    }
  }

  function goRow(row) {
    if (tab === 'associados') {
      const code = row.gs_meta?.open_user_code || row.user_code;
      if (!code) return;
      openFullUrl(`${PATHS.registration}?a=${encodeURIComponent(code)}`);
      setOpen(false);
      return;
    }
    if (tab === 'servicos') {
      const nome = String(row.associate_name || '').replace(/\s+/g, ' ').trim();
      const hRaw = row.consultation_date || row.date_created || '';
      const h = hRaw ? encodeURIComponent(new Date(hRaw).toISOString()) : '';
      openFullUrl(`${PATHS.services}?s=${encodeURIComponent(nome)}${h ? `&h=${h}` : ''}`);
      setOpen(false);
      return;
    }
    if (tab === 'pedidos') {
      const code = row.order_code || row.id;
      if (!code) return;
      openFullUrl(`${PATHS.orders}?p=${encodeURIComponent(code)}`);
      setOpen(false);
      return;
    }
    if (tab === 'triagem' && row.code) {
      openFullUrl(`${PATHS.triage}?t=${encodeURIComponent(row.code)}`);
      setOpen(false);
    }
  }

  const titles = {
    associados: 'Buscar associados',
    pedidos: 'Buscar pedidos',
    servicos: 'Buscar atendimentos',
    triagem: 'Buscar triagem',
  };

  const hints = {
    associados: 'Nome, telefone ou e-mail. Pacientes aparecem com o responsável.',
    pedidos:
      ordersMode === 'tracking'
        ? 'Pesquise pelo código de rastreamento.'
        : 'Pesquise pelo nome do associado no pedido.',
    servicos: 'Pesquise pelo nome do associado vinculado ao atendimento.',
    triagem: 'Pesquise pelo nome ou sobrenome na triagem.',
  };

  const columns = useMemo(() => {
    if (tab === 'associados') {
      return [
        { label: 'Nome', render: (r) => associadoNomeCell(r) },
        { label: 'Status', render: (r) => r.gs_meta?.display_status ?? r.status ?? '' },
        { label: 'E-mail', render: (r) => r.gs_meta?.display_email ?? r.email_account ?? '' },
        { label: 'Telefone', render: (r) => r.gs_meta?.display_phone ?? r.mobile_number ?? '' },
        { label: 'Cadastro', render: (r) => formatDate(r.gs_meta?.display_created ?? r.created_date) },
      ];
    }
    if (tab === 'pedidos') {
      return [
        { label: 'Associado', render: (r) => displayNameTitleCase(r.associate_name || '') },
        { label: 'Rastreamento', render: (r) => r.tracking_code || '' },
        { label: 'Status', render: (r) => r.status || '' },
        { label: 'Criado', render: (r) => formatDate(r.created_date || r.date_created) },
      ];
    }
    if (tab === 'servicos') {
      return [
        { label: 'Associado', render: (r) => displayNameTitleCase(r.associate_name || '') },
        { label: 'Data', render: (r) => formatDate(r.consultation_date || r.date_created) },
        { label: 'Profissional', render: (r) => displayNameTitleCase(r.professional_name || '') },
      ];
    }
    return [
      {
        label: 'Nome',
        render: (r) => displayNameTitleCase([r.name, r.last_name].filter(Boolean).join(' ')),
      },
      { label: 'E-mail', render: (r) => r.email || '' },
      { label: 'Telefone', render: (r) => r.phone || '' },
      { label: 'Criado', render: (r) => formatDate(r.date_created) },
    ];
  }, [tab]);

  const totalPages =
    meta?.total != null && meta.total > 0 ? Math.ceil(meta.total / (meta.limit || 100)) : null;

  const actionColCount = tab === 'associados' ? 3 : 1;
  const emptyColSpan = columns.length + actionColCount;

  return (
    <ThemeProvider theme={muiTheme}>
      <Box
        sx={{
          position: 'fixed',
          top: 'calc(var(--Header-height, 0px) + 16px)',
          right: 54,
          zIndex: Z + 2,
        }}
      >
        <Button
          variant="contained"
          size="large"
          onClick={() => setOpen(true)}
          startIcon={<SearchRoundedIcon />}
          sx={{
            bgcolor: PURPLE,
            color: '#fff',
            borderRadius: 2.5,
            px: 2.5,
            textTransform: 'none',
            fontWeight: 700,
            boxShadow: '0 8px 22px rgba(112, 83, 114, 0.28)',
            '&:hover': {
              bgcolor: PURPLE_HOVER,
              boxShadow: '0 10px 26px rgba(112, 83, 114, 0.34)',
            },
          }}
        >
          Pesquisar
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        fullWidth
        sx={{ zIndex: Z }}
        PaperProps={{
          sx: {
            minHeight: '72vh',
            maxHeight: '94vh',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(27, 46, 30, 0.28)',
            border: '1px solid rgba(49, 67, 51, 0.1)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            color: '#fff',
            px: { xs: 2.5, md: 3 },
            py: 2.5,
            background: 'linear-gradient(120deg, #314a34 0%, #496b4c 58%, #5d735e 100%)',
            '&::after': {
              content: '""',
              position: 'absolute',
              width: 180,
              height: 180,
              right: -40,
              top: -80,
              borderRadius: '50%',
              border: '36px solid rgba(255,255,255,0.06)',
            },
          }}
        >
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={2}
            sx={{ position: 'relative', zIndex: 1 }}
          >
            <Stack direction="row" spacing={1.75} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 2.25,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.16)',
                }}
              >
                <SearchRoundedIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Typography
                  variant="overline"
                  sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
                >
                  Busca global
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 750, lineHeight: 1.2 }}>
                  {titles[tab]}
                </Typography>
              </Box>
            </Stack>
            <IconButton
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              sx={{
                color: '#fff',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
              }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
        </Box>

        <DialogContent sx={{ p: { xs: 2, md: 2.5 }, bgcolor: '#f6f8f6' }}>
          {loading ? (
            <LinearProgress
              sx={{
                mb: 2,
                height: 4,
                borderRadius: 2,
                bgcolor: 'rgba(73, 107, 76, 0.12)',
                '& .MuiLinearProgress-bar': { bgcolor: GREEN },
              }}
            />
          ) : null}

          <Paper
            elevation={0}
            sx={{
              bgcolor: '#fff',
              border: '1px solid rgba(49, 67, 51, 0.1)',
              borderRadius: 3,
              p: { xs: 2, md: 2.25 },
              mb: 2,
              boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                mb: 1.25,
                color: '#657167',
                fontWeight: 700,
                fontSize: '0.72rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Onde pesquisar
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {TAB_OPTIONS.map(({ key, label, icon: Icon }) => {
                const active = tab === key;
                return (
                  <Chip
                    key={key}
                    icon={<Icon sx={{ fontSize: '18px !important' }} />}
                    label={label}
                    onClick={() => {
                      setTab(key);
                      setRows([]);
                      setMeta(null);
                      setError('');
                    }}
                    sx={{
                      height: 36,
                      borderRadius: 2.5,
                      fontWeight: 700,
                      px: 0.5,
                      bgcolor: active ? GREEN : 'rgba(73, 107, 76, 0.08)',
                      color: active ? '#fff' : GREEN,
                      border: active ? 'none' : '1px solid rgba(73, 107, 76, 0.14)',
                      '& .MuiChip-icon': { color: active ? '#fff' : GREEN },
                      '&:hover': {
                        bgcolor: active ? GREEN_HOVER : 'rgba(73, 107, 76, 0.14)',
                      },
                    }}
                  />
                );
              })}
            </Stack>

            <Typography variant="body2" sx={{ mb: 1.5, color: '#657167' }}>
              {hints[tab]}
            </Typography>

            {tab === 'pedidos' ? (
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                {[
                  { value: 'name', label: 'Nome' },
                  { value: 'tracking', label: 'Rastreamento' },
                ].map((opt) => {
                  const active = ordersMode === opt.value;
                  return (
                    <Chip
                      key={opt.value}
                      label={opt.label}
                      size="small"
                      onClick={() => setOrdersMode(opt.value)}
                      sx={{
                        fontWeight: 700,
                        borderRadius: 2,
                        bgcolor: active ? 'rgba(112, 83, 114, 0.14)' : '#f0f3f0',
                        color: active ? PURPLE : '#536056',
                        border: active ? `1px solid rgba(112, 83, 114, 0.35)` : '1px solid transparent',
                      }}
                    />
                  );
                })}
              </Stack>
            ) : null}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                fullWidth
                size="small"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch({ page: 1 });
                }}
                placeholder="Digite para pesquisar…"
                autoFocus
                sx={fieldSx}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                variant="contained"
                onClick={() => runSearch({ page: 1 })}
                disabled={loading}
                sx={{
                  bgcolor: PURPLE,
                  borderRadius: 2.5,
                  px: 2.5,
                  minWidth: 120,
                  textTransform: 'none',
                  fontWeight: 700,
                  boxShadow: '0 7px 18px rgba(112, 83, 114, 0.22)',
                  '&:hover': { bgcolor: PURPLE_HOVER },
                }}
              >
                Consultar
              </Button>
            </Stack>

            {error ? (
              <Typography color="error" variant="body2" sx={{ mt: 1.25, fontWeight: 600 }}>
                {error}
              </Typography>
            ) : null}
          </Paper>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              maxHeight: '46vh',
              borderRadius: 3,
              border: '1px solid rgba(49, 67, 51, 0.1)',
              boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
              overflow: 'auto',
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((c) => (
                    <TableCell key={c.label} sx={headerCellSx}>
                      {c.label}
                    </TableCell>
                  ))}
                  <TableCell sx={headerCellSx}>Abrir</TableCell>
                  {tab === 'associados' ? (
                    <>
                      <TableCell sx={headerCellSx}>Pedidos e Atendimentos</TableCell>
                      <TableCell sx={headerCellSx}>Triagem</TableCell>
                    </>
                  ) : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={emptyColSpan} sx={{ py: 6, borderBottom: 0 }}>
                      <Stack alignItems="center" spacing={1.25}>
                        <CircularProgress size={28} sx={{ color: GREEN }} />
                        <Typography variant="body2" sx={{ color: GREEN, fontWeight: 600 }}>
                          Buscando…
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={emptyColSpan} sx={{ py: 7, borderBottom: 0 }}>
                      <Stack alignItems="center" spacing={1}>
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: '50%',
                            bgcolor: 'rgba(73, 107, 76, 0.1)',
                            color: GREEN,
                          }}
                        >
                          <SearchRoundedIcon />
                        </Box>
                        <Typography fontWeight={700} color="#334235">
                          Nenhum resultado
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Informe um termo e clique em Consultar.
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : null}
                {rows.map((r) => (
                  <TableRow
                    key={r.id || r.user_code || r.order_code || r.code}
                    hover
                    sx={{
                      '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.35, color: '#465348' },
                      '&:last-of-type td': { borderBottom: 0 },
                      '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                    }}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.label}>{c.render(r)}</TableCell>
                    ))}
                    <TableCell>
                      <Button
                        size="small"
                        startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                        onClick={() => goRow(r)}
                        sx={{
                          color: GREEN,
                          textTransform: 'none',
                          fontWeight: 700,
                          borderRadius: 2,
                        }}
                      >
                        Abrir
                      </Button>
                    </TableCell>
                    {tab === 'associados' ? (
                      <>
                        <TableCell>
                          <Stack direction="row" spacing={0.75}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => goOrderOrService(r, 'order')}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: 2,
                                color: PURPLE,
                                borderColor: 'rgba(112, 83, 114, 0.3)',
                                '&:hover': {
                                  borderColor: PURPLE,
                                  bgcolor: 'rgba(112, 83, 114, 0.06)',
                                },
                              }}
                            >
                              Pedido
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => goOrderOrService(r, 'service')}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: 2,
                                color: PURPLE,
                                borderColor: 'rgba(112, 83, 114, 0.3)',
                                '&:hover': {
                                  borderColor: PURPLE,
                                  bgcolor: 'rgba(112, 83, 114, 0.06)',
                                },
                              }}
                            >
                              Atendimento
                            </Button>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => sendTriage(r)}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 700,
                              borderRadius: 2,
                              color: GREEN,
                              borderColor: 'rgba(73, 107, 76, 0.3)',
                              '&:hover': {
                                borderColor: GREEN,
                                bgcolor: 'rgba(73, 107, 76, 0.06)',
                              },
                            }}
                          >
                            Triagem
                          </Button>
                        </TableCell>
                      </>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages && totalPages > 1 ? (
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              justifyContent="center"
              sx={{ mt: 2 }}
            >
              <Button
                size="small"
                startIcon={<ChevronLeftRoundedIcon />}
                disabled={page <= 1 || loading}
                onClick={() => runSearch({ page: page - 1, q: qInput })}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2.5,
                  color: GREEN,
                }}
              >
                Anterior
              </Button>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#465348' }}>
                Página {page} / {totalPages}
              </Typography>
              <Button
                size="small"
                endIcon={<ChevronRightRoundedIcon />}
                disabled={page >= totalPages || loading}
                onClick={() => runSearch({ page: page + 1, q: qInput })}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2.5,
                  color: GREEN,
                }}
              >
                Próxima
              </Button>
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
