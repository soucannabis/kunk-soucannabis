import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import FileUpload from '../../../components/files/FileUpload.jsx';
import { useOperatorAuth } from '@kunk/auth-session';
import {
  AnnotationsTab,
  ConfirmDialog,
  HistoryTab,
  PatientsTab,
  PersonalDataTab,
  PrescriberTab,
  TermStubMenu,
} from './AssociateTabs.jsx';
import { displayName, formatCreated, parseAnnotations, contentAreaDialogProps, contentAreaDialogSx, CONTENT_AREA_DIALOG_Z } from './associatesStatus.js';
import { useCacheConfig } from '../../../lib/cache/CacheConfigProvider.jsx';
import {
  fetchAssociateUser,
  invalidateAssociateCache,
} from '../../../lib/cache/fetchers.js';
import { useToast } from '../../../components/toast/ToastProvider.jsx';
import { PATHS } from '../../../app/menuConfig.js';

const GREEN = '#5a7a5b';

function openFileDownload(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function AssociateModal({ open, user: initialUser, api, onClose, onChanged }) {
  const { user: operator } = useOperatorAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [user, setUser] = useState(initialUser);
  const [patients, setPatients] = useState([]);
  const [history, setHistory] = useState({ orders: [], services: [] });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [termAnchor, setTermAnchor] = useState(null);
  const [confirmMake, setConfirmMake] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [ciap2Enabled, setCiap2Enabled] = useState(true);
  const [hasTerm, setHasTerm] = useState(false);
  const [termStatus, setTermStatus] = useState('none'); // none | pending | completed
  const [termContract, setTermContract] = useState(null);
  const [termModal, setTermModal] = useState(null); // { phase: 'loading'|'done'|'error', url?, message? }
  const { enabled: cacheEnabled } = useCacheConfig();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getCiap2Status();
        if (!cancelled && res?.data && typeof res.data.enabled === 'boolean') {
          setCiap2Enabled(res.data.enabled);
        }
      } catch {
        /* default on */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const userKey = initialUser?.user_code || initialUser?.id || null;

  const reload = useCallback(async ({ initial = false } = {}) => {
    if (!userKey) return;
    if (initial) setLoading(true);
    else setBusy(true);
    if (initial) {
      setHasTerm(false);
      setTermStatus('none');
      setTermContract(null);
    }
    try {
      let u = initialUser;
      if (initialUser?.user_code) {
        u =
          (await fetchAssociateUser(api, cacheEnabled, initialUser.user_code, 'patients=1')) ||
          initialUser;
      }
      setUser(u);
      if (u?.user_code) {
        try {
          const cRes = await api.get(`/doc-sign/contracts/by-user/${u.user_code}`);
          const rows = cRes.data || [];
          const completedRow =
            rows.find((r) => r.status === 'completed') ||
            (u.adhesion_term ? rows.find((r) => r.id === u.adhesion_term) : null) ||
            null;
          let resolvedCompleted = completedRow;
          if (!resolvedCompleted && u.adhesion_term) {
            try {
              const one = await api.get(`/doc-sign/contracts/${u.adhesion_term}`);
              resolvedCompleted = one.data || null;
            } catch {
              /* ignore */
            }
          }
          const pendingRow = rows.find((r) => r.status === 'pending') || null;
          const completed = Boolean(u.adhesion_term) || Boolean(resolvedCompleted);
          const pending = Boolean(pendingRow);
          if (completed) {
            setTermStatus('completed');
            setTermContract(resolvedCompleted);
          } else if (pending) {
            setTermStatus('pending');
            setTermContract(pendingRow);
          } else {
            setTermStatus('none');
            setTermContract(null);
          }
          setHasTerm(completed || pending);
        } catch {
          const completed = Boolean(u.adhesion_term);
          setTermStatus(completed ? 'completed' : 'none');
          setHasTerm(completed);
          setTermContract(null);
        }
      } else {
        const completed = Boolean(u?.adhesion_term);
        setTermStatus(completed ? 'completed' : 'none');
        setHasTerm(completed);
        setTermContract(null);
      }
      if (u?.id) {
        const [pRes, hRes] = await Promise.all([
          api.getUserPatients(u.id),
          api.getUserHistory(u.id),
        ]);
        setPatients(pRes.data || []);
        setHistory(hRes.data || { orders: [], services: [] });
      }
    } catch (err) {
      toast.error(err.message || 'Falha ao carregar dados do associado');
    } finally {
      if (initial) setLoading(false);
      else setBusy(false);
    }
    // initialUser usado só como fallback; identidade controlada por userKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cacheEnabled, userKey, toast]);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setLoading(true);
  }, [open, userKey]);

  useEffect(() => {
    if (open) reload({ initial: true });
  }, [open, reload]);

  async function saveUser(patch, { success = 'Dados salvos com sucesso' } = {}) {
    setBusy(true);
    try {
      const res = await api.updateUser(user.id, patch);
      setUser(res.data);
      invalidateAssociateCache(user.user_code);
      onChanged?.();
      toast.success(success);
      return res.data;
    } catch (err) {
      toast.error(err.message || 'Falha ao salvar');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function makeAssociate() {
    setBusy(true);
    try {
      const res = await api.makeAssociate(user.id);
      setUser(res.data);
      invalidateAssociateCache(user.user_code);
      onChanged?.();
      setConfirmMake(false);
      toast.success('Cadastro tornado associado');
    } catch (err) {
      toast.error(err.message || 'Falha ao tornar associado');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteUser() {
    setBusy(true);
    setDeleteError('');
    try {
      await api.deleteUser(user.id);
      setConfirmDelete(false);
      onChanged?.();
      toast.success('Associado excluído');
      onClose();
    } catch (err) {
      const message = err.message || 'Não foi possível excluir';
      setDeleteError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTriage() {
    if (!user?.user_code) return;
    setBusy(true);
    try {
      const name = user.associate_name || displayName(user).split(' ')[0] || 'Associado';
      const created = await api.createReception({
        name,
        last_name: user.associate_last_name || '',
        email: user.email_account || null,
        phone: user.mobile_number || null,
        is_associate: true,
        associate_code: user.user_code,
        associate_name: displayName(user),
      });
      const code = created?.data?.code;
      onClose();
      navigate(code ? `${PATHS.triage}?t=${encodeURIComponent(code)}` : PATHS.triage);
    } catch (err) {
      toast.error(err.message || 'Falha ao enviar para triagem');
    } finally {
      setBusy(false);
    }
  }

  function goToOrderOrService(kind) {
    if (!user?.user_code) return;
    const path = kind === 'order' ? PATHS.newOrder : PATHS.services;
    onClose();
    navigate(`${path}?u=${encodeURIComponent(user.user_code)}`);
  }

  const annotations = parseAnnotations(user?.annotations);
  const operatorName = [operator?.name, operator?.last_name].filter(Boolean).join(' ') || 'Operador';
  const termSigned = termStatus === 'completed' || Boolean(user?.adhesion_term);
  const termButtonLabel = termSigned
    ? 'Termo do Associado (Assinado)'
    : termStatus === 'pending'
      ? 'Termo do Associado (gerado)'
      : 'Termo do Associado';

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        {...contentAreaDialogProps}
        PaperProps={{ sx: { height: '88vh', maxWidth: 1020, borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ pr: 6 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={user?.avatar_url || undefined} sx={{ bgcolor: GREEN, width: 56, height: 56 }}>
              {(displayName(user) || '?').charAt(0)}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h6">{displayName(user)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Associado desde {formatCreated(user)}
              </Typography>
            </Box>
            {String(user?.status) !== 'Associado' ? (
              <Button
                variant="outlined"
                onClick={() => setConfirmMake(true)}
                disabled={loading}
                sx={{ borderColor: GREEN, color: GREEN }}
              >
                Tornar associado
              </Button>
            ) : null}
            <Button
              startIcon={
                loading ? (
                  <CircularProgress size={18} sx={{ color: '#fff' }} />
                ) : (
                  <DescriptionIcon />
                )
              }
              onClick={(e) => setTermAnchor(e.currentTarget)}
              disabled={loading}
              sx={{
                bgcolor: GREEN,
                color: '#fff',
                '&:hover': { bgcolor: '#303B30' },
                '&.Mui-disabled': {
                  bgcolor: GREEN,
                  color: '#fff',
                  opacity: 0.85,
                },
                '&.Mui-disabled .MuiButton-startIcon': { color: '#fff' },
              }}
            >
              {loading ? 'Carregando termo…' : termButtonLabel}
            </Button>
            <Menu
              anchorEl={termAnchor}
              open={Boolean(termAnchor)}
              onClose={() => setTermAnchor(null)}
              sx={{ zIndex: CONTENT_AREA_DIALOG_Z + 1 }}
            >
              <TermStubMenu
                canCreate={!termSigned}
                canDownload={termSigned}
                onNewTerm={async () => {
                  setTermAnchor(null);
                  if (!user?.user_code || termSigned) return;
                  setTermModal({ phase: 'loading' });
                  try {
                    const res = await api.post('/doc-sign/contracts', {
                      user_code: user.user_code,
                      regenerate: true,
                      send_email: true,
                    });
                    const url = res.data?.signing_url;
                    if (url && navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(url);
                    }
                    setHasTerm(true);
                    setTermStatus('pending');
                    setTermContract(res.data || null);
                    setTermModal({
                      phase: 'done',
                      url: url || null,
                    });
                    onChanged?.();
                    toast.success('Termo gerado com sucesso');
                  } catch (err) {
                    setTermModal(null);
                    toast.error(err.message || 'Falha ao gerar termo');
                  }
                }}
                onDownload={async () => {
                  setTermAnchor(null);
                  if (!user?.user_code) return;
                  setBusy(true);
                  try {
                    let contract = termContract;
                    if (!contract?.signed_pdf_url && !contract?.audit_pdf_url) {
                      const list = await api.get(`/doc-sign/contracts/by-user/${user.user_code}`);
                      contract =
                        (list.data || []).find((r) => r.status === 'completed') ||
                        (list.data || []).find((r) => r.id === user.adhesion_term) ||
                        null;
                      if (contract) setTermContract(contract);
                    }
                    const signedUrl = contract?.signed_pdf_url || contract?.filled_pdf_url;
                    const auditUrl = contract?.audit_pdf_url;
                    if (!signedUrl && !auditUrl) {
                      toast.error('PDFs do termo ainda não disponíveis');
                      return;
                    }
                    openFileDownload(signedUrl);
                    if (auditUrl) {
                      window.setTimeout(() => openFileDownload(auditUrl), 250);
                    }
                    toast.success('Download do termo iniciado');
                  } catch (err) {
                    toast.error(err.message || 'Falha ao baixar termo');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Menu>
          </Stack>
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {loading ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                minHeight: 280,
              }}
            >
              <CircularProgress size={40} sx={{ color: GREEN }} />
              <Typography variant="body2" color="text.secondary">
                Carregando informações…
              </Typography>
            </Box>
          ) : (
            <>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            centered
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              mb: 1,
              flexShrink: 0,
              '& .MuiTabs-flexContainer': { justifyContent: 'center' },
            }}
          >
            <Tab label="Dados Pessoais" />
            <Tab label="Pacientes" />
            <Tab label="Prescritor" />
            <Tab label="Anotações" />
            <Tab label="Documentos" />
            <Tab label="Histórico" />
          </Tabs>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: tab === 0 || tab === 4 ? 'hidden' : 'auto',
              display: tab === 0 || tab === 4 ? 'flex' : 'block',
              flexDirection: 'column',
            }}
          >
            {tab === 0 ? (
              <PersonalDataTab
                user={user}
                busy={busy}
                ciap2Enabled={ciap2Enabled}
                onSave={(patch) => saveUser(patch, { success: 'Dados pessoais salvos' })}
                onDelete={() => setConfirmDelete(true)}
                onSendTriage={sendTriage}
                onGoOrder={() => goToOrderOrService('order')}
                onGoService={() => goToOrderOrService('service')}
              />
            ) : null}
            {tab === 1 ? (
              <PatientsTab
                patients={patients}
                responsible={user}
                busy={busy}
                ciap2Enabled={ciap2Enabled}
                onCreate={async (body) => {
                  setBusy(true);
                  try {
                    await api.createUserPatient(user.id, body);
                    await reload();
                    onChanged?.();
                    toast.success('Paciente criado');
                  } catch (err) {
                    toast.error(err.message || 'Falha ao criar paciente');
                    throw err;
                  } finally {
                    setBusy(false);
                  }
                }}
                onSave={async (patientId, body) => {
                  setBusy(true);
                  try {
                    await api.updateUserPatient(user.id, patientId, body);
                    await reload();
                    onChanged?.();
                    toast.success('Paciente atualizado');
                  } catch (err) {
                    toast.error(err.message || 'Falha ao salvar paciente');
                    throw err;
                  } finally {
                    setBusy(false);
                  }
                }}
                onDelete={async (patientId) => {
                  setBusy(true);
                  try {
                    await api.deleteUserPatient(user.id, patientId);
                    await reload();
                    onChanged?.();
                    toast.success('Paciente excluído');
                  } catch (err) {
                    toast.error(err.message || 'Falha ao excluir paciente');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
            {tab === 2 ? (
              <PrescriberTab user={user} onSave={saveUser} busy={busy} FileUpload={FileUpload} api={api} />
            ) : null}
            {tab === 3 ? (
              <AnnotationsTab
                annotations={annotations}
                busy={busy}
                operatorName={operatorName}
                onAdd={async (item) => {
                  await saveUser(
                    { annotations: [...annotations, item] },
                    { success: 'Anotação adicionada' }
                  );
                }}
                onRemove={async (id) => {
                  await saveUser(
                    { annotations: annotations.filter((a) => a.id !== id) },
                    { success: 'Anotação removida' }
                  );
                }}
              />
            ) : null}
            {tab === 4 && user ? (
              <FileUpload
                api={api}
                user={user}
                onUploaded={() => toast.success('Documento enviado')}
                onDeleted={() => toast.success('Documento removido')}
              />
            ) : null}
            {tab === 5 ? <HistoryTab history={history} /> : null}
          </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmMake}
        title="Tornar este cadastro Associado? (não gera termo)"
        onClose={() => setConfirmMake(false)}
        onConfirm={makeAssociate}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir associado? Só funciona sem pedidos, serviços ou pacientes."
        onClose={() => {
          if (busy) return;
          setConfirmDelete(false);
          setDeleteError('');
        }}
        onConfirm={confirmDeleteUser}
        busy={busy}
        error={deleteError}
      />
      <Dialog
        open={Boolean(termModal)}
        onClose={termModal?.phase === 'loading' ? undefined : () => setTermModal(null)}
        maxWidth="sm"
        fullWidth
        {...contentAreaDialogProps}
        sx={{
          ...contentAreaDialogSx,
          zIndex: CONTENT_AREA_DIALOG_Z + 10,
        }}
      >
        <DialogTitle>
          {termModal?.phase === 'loading'
            ? 'Gerando termo'
            : termModal?.title || 'Termo gerado. Link copiado:'}
        </DialogTitle>
        <DialogContent>
          {termModal?.phase === 'loading' ? (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ py: 1 }}>
              <CircularProgress size={28} sx={{ color: GREEN }} />
              <Typography variant="body1">Gerando termo para assinatura</Typography>
            </Stack>
          ) : (
            <>
              {termModal?.url ? (
                <Typography
                  variant="body2"
                  component="a"
                  href={termModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ wordBreak: 'break-all', color: GREEN, display: 'block' }}
                >
                  {termModal.url}
                </Typography>
              ) : (
                <Typography variant="body1">Termo gerado.</Typography>
              )}
            </>
          )}
        </DialogContent>
        {termModal?.phase !== 'loading' ? (
          <DialogActions>
            <Button
              variant="contained"
              onClick={() => setTermModal(null)}
              sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
            >
              OK
            </Button>
          </DialogActions>
        ) : null}
      </Dialog>
    </>
  );
}
