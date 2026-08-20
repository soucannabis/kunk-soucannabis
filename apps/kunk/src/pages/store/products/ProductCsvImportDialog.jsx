import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';
const PURPLE = '#7A5B7A';

function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProductCsvImportDialog({ open, onClose, api, onImported, showError }) {
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const validCount = report?.valid || 0;
  const invalidCount = report?.invalid || 0;
  const canImport = Boolean(report && validCount > 0 && !importResult);

  function reset() {
    setCsvText('');
    setReport(null);
    setImportResult(null);
    setBusy(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose?.();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setReport(null);
    setImportResult(null);
  }

  async function onValidate() {
    if (!csvText.trim()) {
      showError?.(new Error('Cole ou selecione um CSV'));
      return;
    }
    setBusy(true);
    setImportResult(null);
    try {
      const res = await api.validateProductsImport({ csv: csvText });
      setReport(res.data);
    } catch (err) {
      showError?.(err);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmImport() {
    if (!canImport) return;
    if (invalidCount > 0) {
      const ok = window.confirm(
        `Há ${invalidCount} linha(s) inválida(s) que serão ignoradas. Importar apenas as ${validCount} válida(s)?`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await api.importProducts({ csv: csvText });
      setImportResult(res.data);
      if (res.data?.success) {
        await onImported?.(res.data);
      } else if (res.data?.created + res.data?.updated > 0) {
        await onImported?.(res.data);
      }
    } catch (err) {
      showError?.(err);
    } finally {
      setBusy(false);
    }
  }

  const previewRows = useMemo(() => (report?.rows || []).slice(0, 50), [report]);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md" {...contentAreaDialogProps}>
      <DialogTitle>Importar produtos (CSV)</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Headers obrigatórios: sku, name, type, unit, concentration, price, amount, category, batch,
          status. Upsert por SKU.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button component="label" variant="outlined" disabled={busy}>
            Selecionar arquivo
            <input hidden type="file" accept=".csv,text/csv" onChange={onFile} />
          </Button>
          <Button
            variant="outlined"
            disabled={busy}
            href="/examples/produtos-import-exemplo.csv"
            download
          >
            Baixar CSV de exemplo
          </Button>
        </Box>

        <Box
          component="textarea"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setReport(null);
            setImportResult(null);
          }}
          placeholder="Cole o conteúdo CSV aqui…"
          disabled={busy}
          style={{
            width: '100%',
            minHeight: 120,
            fontFamily: 'monospace',
            fontSize: 13,
            padding: 12,
            borderRadius: 8,
            border: '1px solid #ccc',
            resize: 'vertical',
          }}
        />

        {report && (
          <Alert severity={invalidCount ? 'warning' : 'success'}>
            Pré-validação: {validCount} válida(s), {invalidCount} inválida(s) de {report.total}{' '}
            linha(s).
          </Alert>
        )}

        {importResult && (
          <Alert severity={importResult.success ? 'success' : 'warning'}>
            {importResult.success
              ? `Importação concluída com sucesso: ${importResult.created} criado(s), ${importResult.updated} atualizado(s).`
              : `Importação parcial: ${importResult.created} criado(s), ${importResult.updated} atualizado(s), ${importResult.failed} falha(s).`}
          </Alert>
        )}

        {previewRows.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Linha</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Ação</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Erros</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={`${row.line}-${row.payload?.sku || ''}`}>
                  <TableCell>{row.line}</TableCell>
                  <TableCell>{row.payload?.sku || '—'}</TableCell>
                  <TableCell>{row.action || '—'}</TableCell>
                  <TableCell sx={{ color: row.ok ? GREEN : '#c62828', fontWeight: 600 }}>
                    {row.ok ? 'OK' : 'Erro'}
                  </TableCell>
                  <TableCell>{(row.errors || []).join('; ') || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={busy}>
          Fechar
        </Button>
        <Button onClick={onValidate} disabled={busy || !csvText.trim()} variant="outlined">
          {busy && !importResult ? <CircularProgress size={18} /> : 'Pré-validar'}
        </Button>
        <Button
          onClick={onConfirmImport}
          disabled={busy || !canImport}
          variant="contained"
          sx={{ bgcolor: PURPLE, '&:hover': { bgcolor: '#4d2d4d' } }}
        >
          Confirmar importação
        </Button>
        {importResult?.success && (
          <Button
            variant="outlined"
            onClick={() =>
              downloadText(
                'produtos-import-resultado.csv',
                `created,${importResult.created}\nupdated,${importResult.updated}\n`
              )
            }
          >
            Resumo
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
