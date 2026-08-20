import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_KEYS,
  buildDocumentFileName,
  getDocumentKind,
} from '../../lib/documentKinds.js';
import { useErrorModal } from '../errors/ErrorModalProvider.jsx';
import { useToast } from '../toast/ToastProvider.jsx';
import { contentAreaSelectProps } from '../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';
const GREEN_HOVER = '#303B30';

const SELECT_MENU_PROPS = contentAreaSelectProps.MenuProps;

function labelForFile(file) {
  const docKind = String(file?.doc_kind || '');
  const subject = String(file?.subject || '');
  const match = DOCUMENT_KIND_KEYS.map((key) => DOCUMENT_KINDS[key]).find((cfg) => {
    if (cfg.doc_kind !== docKind) return false;
    if (cfg.subject == null) return !subject;
    return cfg.subject === subject;
  });
  if (match) return match.label;
  if (docKind === 'identity' && subject === 'patient') return 'Documento do paciente';
  if (docKind === 'identity') return 'Documento do Associado';
  if (docKind === 'prescription') return 'Receita';
  if (docKind === 'report') return 'Laudo';
  if (docKind === 'exam') return 'Exame';
  return docKind || 'Documento';
}

/**
 * Upload global de arquivos do associado.
 *
 * @param {object} props
 * @param {object} props.api — createApiClient
 * @param {object} props.user — associado (precisa de id + user_code)
 * @param {string} [props.kind] — se informado, fixa o tipo (ex.: "prescription") e não mostra seletor
 * @param {function} [props.onUploaded]
 * @param {function} [props.onDeleted]
 * @param {boolean} [props.readOnly]
 */
export default function FileUpload({
  api,
  user,
  kind: kindProp,
  onUploaded,
  onDeleted,
  readOnly = false,
}) {
  const fixedKind = kindProp ? getDocumentKind(kindProp) : null;
  const splitLayout = !fixedKind;
  const [pickerKind, setPickerKind] = useState(kindProp || '');
  const activeKindKey = fixedKind?.key || pickerKind || '';
  const activeKind = getDocumentKind(activeKindKey);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { showError } = useErrorModal();
  const toast = useToast();
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewMime, setPreviewMime] = useState('');
  const inputRef = useRef(null);

  const userId = user?.id;
  // Com `kind` fixo (ex.: receita no prescritor), filtra por doc_kind.
  // Na aba Documentos (sem kind), lista todos os arquivos do associado.
  const listDocKind = fixedKind?.doc_kind || null;

  const loadFiles = useCallback(async () => {
    if (!api || !userId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.listUserFiles({
        userId,
        docKind: listDocKind || undefined,
        limit: 50,
      });
      setFiles(res.data || []);
    } catch (err) {
      showError(err.message || 'Falha ao listar arquivos');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [api, userId, listDocKind, showError]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const title = useMemo(() => {
    if (fixedKind) return fixedKind.label;
    return 'Documentos';
  }, [fixedKind]);

  async function openPreview(file) {
    if (!api?.fileDownload) return;
    try {
      const blob = await api.fileDownload(file.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewMime(file.mime_type || blob.type || '');
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      showError(err.message || 'Erro ao visualizar');
    }
  }

  async function handleUpload(fileList) {
    if (!api || !userId || !activeKind || !fileList?.length) return;
    if (!fixedKind && !pickerKind) {
      toast.error('Selecione o tipo do documento.');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const filename = buildDocumentFileName(activeKind, user, file.name);
        const fd = new FormData();
        fd.append('file', file, filename);
        fd.append('filename', filename);
        fd.append('user_id', String(userId));
        fd.append('doc_kind', activeKind.doc_kind);
        if (activeKind.subject) fd.append('subject', activeKind.subject);

        const res = await api.uploadFile(fd);

        if (activeKind.doc_kind === 'prescription' && userId) {
          try {
            await api.updateItem('users', userId, { prescription: res.data?.id || null });
          } catch {
            /* campo opcional */
          }
        }

        onUploaded?.(res.data, activeKind);
      }
      if (!fixedKind) setPickerKind('');
      await loadFiles();
      if (!onUploaded) toast.success('Documento enviado');
    } catch (err) {
      toast.error(err.message || 'Falha no upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(file) {
    if (!api || readOnly) return;
    if (!window.confirm(`Remover ${file.filename}?`)) return;
    try {
      await api.deleteFile(file.id);
      onDeleted?.(file);
      await loadFiles();
      if (!onDeleted) toast.success('Documento removido');
    } catch (err) {
      toast.error(err.message || 'Falha ao remover');
    }
  }

  function onInputChange(e) {
    const list = e.target.files;
    if (!list?.length) return;
    handleUpload(list);
  }

  const uploadPanel = (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
        {splitLayout ? 'Enviar documento' : title}
      </Typography>

      {!fixedKind && !readOnly && (
        <TextField
          select
          size="small"
          fullWidth
          label="Tipo do documento"
          value={pickerKind}
          onChange={(e) => setPickerKind(e.target.value)}
          sx={{ mb: 1.5 }}
          data-testid="file-upload-kind"
          SelectProps={{ MenuProps: SELECT_MENU_PROPS }}
        >
          <MenuItem value="">
            <em>Selecione</em>
          </MenuItem>
          {DOCUMENT_KIND_KEYS.map((key) => (
            <MenuItem key={key} value={key}>
              {DOCUMENT_KINDS[key].label}
            </MenuItem>
          ))}
        </TextField>
      )}

      {!readOnly && (
        <Stack spacing={1}>
          <Button
            variant="contained"
            size="small"
            fullWidth={splitLayout}
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
            disabled={uploading || !userId || (!fixedKind && !pickerKind)}
            onClick={() => inputRef.current?.click()}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
            data-testid="file-upload-button"
          >
            Enviar arquivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="image/*,application/pdf"
            onChange={onInputChange}
            data-testid="file-upload-input"
          />
          {activeKind && (
            <Typography variant="caption" color="text.secondary">
              Prefixo: {activeKind.prefix}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );

  const filesPanel = (
    <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
      {splitLayout ? (
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
          Documentos do associado
        </Typography>
      ) : null}

      {loading ? (
        <CircularProgress size={24} sx={{ color: GREEN }} />
      ) : (
        <Stack spacing={0.75} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {files.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nenhum arquivo {fixedKind ? `de ${fixedKind.label.toLowerCase()} ` : ''}enviado.
            </Typography>
          )}
          {files.map((f) => {
            const isPdf = String(f.mime_type || '').includes('pdf') || /\.pdf$/i.test(f.filename || '');
            return (
              <Box
                key={f.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  border: '1px solid #ddd',
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                }}
                data-testid={`file-row-${f.id}`}
              >
                {isPdf ? <PictureAsPdfIcon fontSize="small" color="action" /> : <ImageIcon fontSize="small" color="action" />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {!fixedKind ? (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {labelForFile(f)}
                    </Typography>
                  ) : null}
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => openPreview(f)}
                    sx={{ textAlign: 'left', fontSize: 13 }}
                  >
                    {f.filename}
                  </Link>
                </Box>
                {!readOnly && (
                  <IconButton size="small" aria-label="Remover" onClick={() => handleDelete(f)}>
                    <DeleteForeverIcon fontSize="small" color="error" />
                  </IconButton>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {previewUrl && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="caption">Pré-visualização</Typography>
            <Button
              size="small"
              onClick={() => {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
            >
              Fechar
            </Button>
          </Stack>
          {String(previewMime).includes('pdf') ? (
            <Box
              component="iframe"
              src={previewUrl}
              title="preview"
              sx={{ width: '100%', height: 280, border: '1px solid #ccc' }}
            />
          ) : (
            <Box
              component="img"
              src={previewUrl}
              alt="preview"
              sx={{ maxWidth: '100%', maxHeight: 280, display: 'block', border: '1px solid #ccc' }}
            />
          )}
        </Box>
      )}
    </Box>
  );

  if (splitLayout) {
    return (
      <Box
        data-testid="file-upload"
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            border: '1px solid #e0e0e0',
            borderRadius: 2,
            p: 2,
          }}
        >
          {uploadPanel}
        </Box>
        <Box
          sx={{
            border: '1px solid #e0e0e0',
            borderRadius: 2,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {filesPanel}
        </Box>
      </Box>
    );
  }

  return (
    <Box data-testid="file-upload" sx={{ width: '100%', mt: 1 }}>
      {uploadPanel}
      <Box sx={{ mt: 2 }}>{filesPanel}</Box>
    </Box>
  );
}
