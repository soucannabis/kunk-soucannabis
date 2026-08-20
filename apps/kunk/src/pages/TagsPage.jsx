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
  FormGroup,
  InputAdornment,
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
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../components/errors/ErrorModalProvider.jsx';
import { useCacheConfig } from '../lib/cache/CacheConfigProvider.jsx';
import { fetchTags, invalidateTagsCache } from '../lib/cache/fetchers.js';
import { contentAreaDialogProps } from '../layout/contentAreaOverlay.js';

const materialTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
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

const CONTEXT_OPTIONS = [
  { value: 'orders', label: 'Pedidos' },
  { value: 'services', label: 'Serviços' },
  { value: 'reception', label: 'Triagem' },
];

const CONTEXT_LABELS = Object.fromEntries(CONTEXT_OPTIONS.map((c) => [c.value, c.label]));

const EMPTY = { tag: '', contexts: [], color: '#546E7A' };

function parseContexts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function contextsToString(list) {
  return (list || []).join(',');
}

export default function TagsPage() {
  const api = useMemo(() => {
    const bootstrap = getKunkPublicConfig();
    return createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' });
  }, []);
  const { showError } = useErrorModal();
  const { enabled: cacheEnabled } = useCacheConfig();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [scTags, setScTags] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchTags(api, cacheEnabled, 'limit=500');
      setRows(list);
    } catch (err) {
      showError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
    try {
      const st = await api.getSoucannabisOrdersStatus();
      if (st.data?.enabled && st.data?.sync_tags !== false) {
        const tres = await api.listSoucannabisTags();
        const list = Array.isArray(tres.data) ? tres.data : [];
        setScTags(
          list.map((t) =>
            typeof t === 'string'
              ? { tag: t, color: '#496b4c' }
              : { tag: t.tag || t.name, color: t.color || '#496b4c' }
          )
        );
      } else {
        setScTags([]);
      }
    } catch {
      setScTags([]);
    }
  }, [api, cacheEnabled, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const tag = String(row.tag || '').toLowerCase();
      const contexts = String(row.contexts || '').toLowerCase();
      return tag.includes(needle) || contexts.includes(needle);
    });
  }, [rows, q]);

  function openNew() {
    setForm(EMPTY);
    setDialog({ mode: 'new' });
  }

  function openEdit(row) {
    setForm({
      tag: row.tag || '',
      contexts: parseContexts(row.contexts),
      color: row.color || '#546E7A',
    });
    setDialog({ mode: 'edit', id: row.id });
  }

  function toggleContext(value) {
    setForm((prev) => {
      const has = prev.contexts.includes(value);
      return {
        ...prev,
        contexts: has ? prev.contexts.filter((c) => c !== value) : [...prev.contexts, value],
      };
    });
  }

  async function onSave() {
    const tag = form.tag.trim();
    if (!tag) {
      showError(new Error('Informe o nome da tag'));
      return;
    }
    if (!form.contexts.length) {
      showError(new Error('Selecione ao menos um contexto'));
      return;
    }
    setBusy(true);
    try {
      const body = {
        tag,
        contexts: contextsToString(form.contexts),
        color: form.color || '#546E7A',
      };
      if (dialog.mode === 'new') await api.createItem('tags', body);
      else await api.updateItem('tags', dialog.id, body);
      invalidateTagsCache();
      setDialog(null);
      await load();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!window.confirm(`Excluir a tag "${row.tag}"?`)) return;
    try {
      await api.deleteItem('tags', row.id);
      invalidateTagsCache();
      await load();
    } catch (err) {
      showError(err);
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
              <LocalOfferOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Sistema
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Tags
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Organize rótulos usados em pedidos, serviços e triagem.
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
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar por nome ou contexto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{ ...fieldSx, maxWidth: 420 }}
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
              Nova tag
            </Button>
          </Stack>
          <Typography variant="body2" sx={{ mt: 2, color: '#657167' }}>
            {filtered.length === 0
              ? 'Nenhuma tag encontrada'
              : `Exibindo ${filtered.length} tag${filtered.length === 1 ? '' : 's'}`}
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
                  {['Tag', 'Contextos', 'Cor', 'Ações'].map((h) => (
                    <TableCell
                      key={h}
                      align={h === 'Ações' ? 'right' : 'left'}
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
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 8, borderBottom: 0 }}>
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
                          <LocalOfferOutlinedIcon />
                        </Box>
                        <Typography fontWeight={700} color="#334235">
                          Nenhuma tag encontrada
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const contexts = parseContexts(row.contexts);
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
                        <TableCell>
                          <Chip
                            label={row.tag || '—'}
                            size="small"
                            sx={{
                              bgcolor: row.color || '#546E7A',
                              color: '#fff',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {contexts.length
                              ? contexts.map((c) => (
                                  <Chip
                                    key={c}
                                    label={CONTEXT_LABELS[c] || c}
                                    size="small"
                                    variant="outlined"
                                    sx={{ borderColor: 'rgba(73, 107, 76, 0.35)', color: GREEN }}
                                  />
                                ))
                              : '—'}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 18,
                                height: 18,
                                borderRadius: '4px',
                                bgcolor: row.color || '#ccc',
                                border: '1px solid #bbb',
                              }}
                            />
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#536056' }}>
                              {row.color || '—'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => openEdit(row)}
                            sx={{ color: GREEN, textTransform: 'none', fontWeight: 700 }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => onDelete(row)}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                          >
                            Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {scTags.length > 0 && (
          <Paper
            elevation={0}
            data-testid="sc-tags-section"
            sx={{
              bgcolor: '#fff',
              border: '1px solid rgba(49, 67, 51, 0.1)',
              borderRadius: 3,
              p: { xs: 2, md: 2.5 },
              mt: 2,
              boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: GREEN, mb: 0.5 }}>
              Tags SouCannabis
            </Typography>
            <Typography variant="body2" sx={{ color: '#657167', mb: 1.5 }}>
              Somente leitura — sincronizadas do catálogo externo.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {scTags.map((t) => (
                <Chip
                  key={t.tag}
                  label={t.tag}
                  size="small"
                  sx={{ bgcolor: t.color || GREEN, color: '#fff', fontWeight: 600 }}
                />
              ))}
            </Box>
          </Paper>
        )}
      </Box>

      <Dialog
        open={Boolean(dialog)}
        onClose={() => !busy && setDialog(null)}
        fullWidth
        maxWidth="sm"
        {...contentAreaDialogProps}
      >
        <DialogTitle>{dialog?.mode === 'edit' ? 'Editar tag' : 'Nova tag'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label="Nome"
            value={form.tag}
            onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))}
            fullWidth
            margin="dense"
          />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Contextos
            </Typography>
            <FormGroup row>
              {CONTEXT_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  control={
                    <Checkbox
                      checked={form.contexts.includes(opt.value)}
                      onChange={() => toggleContext(opt.value)}
                    />
                  }
                  label={opt.label}
                />
              ))}
            </FormGroup>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              label="Cor"
              type="color"
              value={form.color || '#546E7A'}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              sx={{ width: 120 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hex"
              value={form.color || ''}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              sx={{ flex: 1 }}
              placeholder="#546E7A"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={busy}
            sx={{ bgcolor: PURPLE, '&:hover': { bgcolor: PURPLE_HOVER } }}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
