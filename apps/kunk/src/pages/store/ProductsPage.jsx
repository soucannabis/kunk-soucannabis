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
  Drawer,
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
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { contentAreaDialogProps, contentAreaSelectProps } from '../../layout/contentAreaOverlay.js';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { invalidateProductsCache } from '../../lib/cache/fetchers.js';
import ProductCsvImportDialog from './products/ProductCsvImportDialog.jsx';

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
const PURPLE = '#705372';

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

const EMPTY = {
  sku: '',
  name: '',
  type: '',
  unit: '',
  concentration: '',
  price: '',
  amount: '0',
  category: '',
  batch: '',
  status: 'published',
};

const STATUS_OPTIONS = [
  { value: 'published', label: 'Publicado' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'archived', label: 'Arquivado' },
];

const KIND_LABELS = {
  sale: 'Venda',
  sale_reversal: 'Estorno',
  adjustment: 'Ajuste',
};

const TABLE_HEADERS = [
  { key: 'sku', label: 'SKU' },
  { key: 'nome', label: 'Nome' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'preco', label: 'Preço' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'lote', label: 'Lote' },
  { key: 'status', label: 'Status' },
  { key: 'acoes', label: 'Ações' },
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

function statusVisual(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'published') {
    return { label: 'Publicado', bgcolor: 'rgba(73, 107, 76, 0.12)', color: GREEN };
  }
  if (value === 'draft') {
    return { label: 'Rascunho', bgcolor: 'rgba(112, 83, 114, 0.12)', color: PURPLE };
  }
  if (value === 'archived') {
    return { label: 'Arquivado', bgcolor: 'rgba(102, 113, 104, 0.12)', color: '#667168' };
  }
  return { label: status || '—', bgcolor: '#eef2ef', color: '#536056' };
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toForm(row) {
  return {
    sku: row.sku || '',
    name: row.name || '',
    type: row.type || '',
    unit: row.unit || '',
    concentration: row.concentration != null ? String(row.concentration) : '',
    price: row.price != null ? String(row.price) : '',
    amount: row.amount != null ? String(row.amount) : '0',
    category: row.category || '',
    batch: row.batch || '',
    status: row.status || 'published',
  };
}

function buildPayload(form) {
  const concentration =
    form.concentration === '' || form.concentration == null
      ? null
      : Number(form.concentration);
  const price = Number(String(form.price).replace(',', '.'));
  const amount = Math.trunc(Number(form.amount));
  if (!form.sku.trim()) throw new Error('Informe o SKU');
  if (!form.name.trim()) throw new Error('Informe o nome');
  if (!Number.isFinite(price)) throw new Error('Preço inválido');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Estoque inválido');
  if (concentration != null && (!Number.isFinite(concentration) || !Number.isInteger(concentration))) {
    throw new Error('Concentração inválida');
  }
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    type: form.type.trim() || null,
    unit: form.unit.trim() || null,
    concentration,
    price,
    amount,
    category: form.category.trim() || null,
    batch: form.batch.trim() || null,
    status: form.status || 'published',
  };
}

export default function ProductsPage() {
  const api = useMemo(() => {
    const bootstrap = getKunkPublicConfig();
    return createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' });
  }, []);
  const { showError } = useErrorModal();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stockDialog, setStockDialog] = useState(null);
  const [stockDelta, setStockDelta] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [history, setHistory] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listItems('products', 'limit=500&sort=-id');
      setRows(res.data || []);
    } catch (err) {
      showError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const blob = [row.sku, row.name, row.type, row.category, row.batch, row.status]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return blob.includes(needle);
    });
  }, [rows, q]);

  function openNew() {
    setForm(EMPTY);
    setDialog({ mode: 'new' });
  }

  function openEdit(row) {
    setForm(toForm(row));
    setDialog({ mode: 'edit', id: row.id });
  }

  async function onSave() {
    setBusy(true);
    try {
      const body = buildPayload(form);
      if (dialog.mode === 'new') await api.createItem('products', body);
      else await api.updateItem('products', dialog.id, body);
      invalidateProductsCache();
      setDialog(null);
      await load();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row) {
    if (!window.confirm(`Excluir o produto "${row.name}" (${row.sku})?`)) return;
    try {
      await api.deleteItem('products', row.id);
      invalidateProductsCache();
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function onExport() {
    try {
      const csv = await api.exportProductsCsv();
      downloadText('produtos.csv', csv);
    } catch (err) {
      showError(err);
    }
  }

  async function openHistory(row) {
    setHistory(row);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const res = await api.listProductMovements(row.id, '?limit=100');
      setHistoryRows(res.data?.movements || []);
    } catch (err) {
      showError(err);
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function onAdjustStock() {
    const delta = Math.trunc(Number(stockDelta));
    if (!Number.isFinite(delta) || delta === 0) {
      showError(new Error('Informe um delta inteiro diferente de zero'));
      return;
    }
    setBusy(true);
    try {
      await api.adjustProductStock(stockDialog.id, { delta, note: stockNote || undefined });
      invalidateProductsCache();
      setStockDialog(null);
      setStockDelta('');
      setStockNote('');
      await load();
      if (history?.id === stockDialog.id) await openHistory(stockDialog);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
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
              <Inventory2OutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Loja
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Gestão de produtos
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Cadastre itens, controle estoque e acompanhe movimentações.
              </Typography>
            </Box>
          </Stack>
        </Box>

        {importSuccess ? (
          <Paper
            elevation={0}
            sx={{
              bgcolor: 'rgba(73, 107, 76, 0.1)',
              border: '1px solid rgba(73, 107, 76, 0.18)',
              borderRadius: 3,
              p: 2,
              mb: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: GREEN, fontWeight: 700 }}>
              Importação concluída: {importSuccess.created} criado(s), {importSuccess.updated}{' '}
              atualizado(s). Todos os produtos válidos foram gravados.
            </Typography>
            <IconButton size="small" onClick={() => setImportSuccess(null)} aria-label="Fechar">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Paper>
        ) : null}

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
              placeholder="SKU, nome, tipo ou lote"
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
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
              flexWrap="wrap"
              useFlexGap
            >
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={onExport}
                sx={{
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  color: PURPLE,
                  borderColor: 'rgba(112, 83, 114, 0.3)',
                  '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(112, 83, 114, 0.06)' },
                }}
              >
                Exportar CSV
              </Button>
              <Button
                variant="outlined"
                startIcon={<FileUploadOutlinedIcon />}
                onClick={() => setImportOpen(true)}
                sx={{
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  color: PURPLE,
                  borderColor: 'rgba(112, 83, 114, 0.3)',
                  '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(112, 83, 114, 0.06)' },
                }}
              >
                Importar CSV
              </Button>
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
                Novo produto
              </Button>
            </Stack>
          </Stack>
          <Typography variant="body2" sx={{ mt: 2, color: '#657167' }}>
            {filtered.length === 0
              ? 'Nenhum produto encontrado'
              : `Exibindo ${filtered.length} produto${filtered.length === 1 ? '' : 's'}`}
          </Typography>
        </Paper>

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
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid rgba(49, 67, 51, 0.1)',
              boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
              overflowX: { xs: 'auto', md: 'visible' },
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
                minWidth: { xs: 980, md: 'unset' },
              }}
            >
              <TableHead>
                <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                  {TABLE_HEADERS.map((h) => (
                    <TableCell
                      key={h.key}
                      align={h.key === 'acoes' ? 'center' : 'left'}
                      sx={{
                        color: '#627064',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderBottomColor: 'rgba(49, 67, 51, 0.1)',
                        py: 1.5,
                        whiteSpace: 'nowrap',
                        ...(h.key === 'sku' ? { width: '12%' } : null),
                        ...(h.key === 'nome' ? { width: '22%' } : null),
                        ...(h.key === 'tipo' ? { width: '12%' } : null),
                        ...(h.key === 'preco' ? { width: '11%' } : null),
                        ...(h.key === 'estoque' ? { width: '10%' } : null),
                        ...(h.key === 'lote' ? { width: '10%' } : null),
                        ...(h.key === 'status' ? { width: '12%' } : null),
                        ...(h.key === 'acoes' ? { width: '11%', px: 1.5 } : null),
                      }}
                    >
                      {h.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
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
                          <Inventory2OutlinedIcon />
                        </Box>
                        <Typography fontWeight={700} color="#334235">
                          Nenhum produto encontrado
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Ajuste a busca ou cadastre um novo produto.
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const status = statusVisual(row.status);
                    const inStock = Number(row.amount) > 0;
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
                        <TableCell
                          sx={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            color: '#465348',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={row.sku || ''}
                        >
                          {row.sku || '—'}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: '#2f3d31',
                            fontWeight: 650,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={row.name || ''}
                        >
                          {row.name || '—'}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: '#536056',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.type || '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                          {row.price != null
                            ? Number(row.price).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.amount ?? 0}
                            sx={{
                              fontWeight: 700,
                              bgcolor: inStock ? 'rgba(73, 107, 76, 0.12)' : 'rgba(180, 70, 70, 0.12)',
                              color: inStock ? GREEN : '#8a5a5a',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                          {row.batch || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={status.label}
                            sx={{
                              fontWeight: 600,
                              bgcolor: status.bgcolor,
                              color: status.color,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ px: 1.5, verticalAlign: 'middle' }}>
                          <Stack spacing={0.25} alignItems="center">
                            <Tooltip title="Editar">
                              <IconButton size="small" onClick={() => openEdit(row)} sx={{ color: GREEN }}>
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Ajustar estoque">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setStockDialog(row);
                                  setStockDelta('');
                                  setStockNote('');
                                }}
                                sx={{ color: PURPLE }}
                              >
                                <WarehouseOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Histórico">
                              <IconButton size="small" onClick={() => openHistory(row)} sx={{ color: '#667168' }}>
                                <HistoryRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir">
                              <IconButton size="small" onClick={() => onDelete(row)} sx={{ color: '#8a5a5a' }}>
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
        )}
      </Box>

      <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="sm" {...contentAreaDialogProps}>
        <DialogTitle>{dialog?.mode === 'edit' ? 'Editar produto' : 'Novo produto'}</DialogTitle>
        <DialogContent
          sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}
        >
          {[
            ['sku', 'SKU', true],
            ['name', 'Nome', true],
            ['type', 'Tipo', false],
            ['unit', 'Unidade', false],
            ['concentration', 'Concentração', false],
            ['price', 'Preço', true],
            ['amount', 'Estoque', true],
            ['category', 'Categoria', false],
            ['batch', 'Lote', false],
          ].map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={form[key]}
              onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              fullWidth
              margin="dense"
              sx={key === 'name' ? { gridColumn: '1 / -1' } : undefined}
            />
          ))}
          <TextField
            select
            label="Status"
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            fullWidth
            margin="dense"
            SelectProps={contentAreaSelectProps}
          >
            {STATUS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={busy}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(stockDialog)}
        onClose={() => !busy && setStockDialog(null)}
        fullWidth
        maxWidth="xs"
        {...contentAreaDialogProps}
      >
        <DialogTitle>Ajustar estoque — {stockDialog?.sku}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2">
            Estoque atual: <strong>{stockDialog?.amount ?? 0}</strong>
          </Typography>
          <TextField
            label="Delta (+ entrada / − saída)"
            value={stockDelta}
            onChange={(e) => setStockDelta(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="Nota"
            value={stockNote}
            onChange={(e) => setStockNote(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialog(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={onAdjustStock}
            disabled={busy}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={Boolean(history)} onClose={() => setHistory(null)}>
        <Box sx={{ width: { xs: 320, sm: 420 }, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Histórico — {history?.name}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
            SKU {history?.sku} · estoque {history?.amount ?? 0}
          </Typography>
          {historyLoading ? (
            <CircularProgress size={28} sx={{ color: GREEN }} />
          ) : historyRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nenhum movimento registrado.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Qtd</TableCell>
                  <TableCell>Pedido</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historyRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.date_created
                        ? new Date(m.date_created).toLocaleString('pt-BR')
                        : '—'}
                    </TableCell>
                    <TableCell>{KIND_LABELS[m.kind] || m.kind}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{m.quantity}</TableCell>
                    <TableCell>{m.order_id || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </Drawer>

      <ProductCsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        api={api}
        showError={showError}
        onImported={async (result) => {
          invalidateProductsCache();
          await load();
          if (result?.success) {
            setImportSuccess(result);
            setImportOpen(false);
          }
        }}
      />
    </ThemeProvider>
  );
}
