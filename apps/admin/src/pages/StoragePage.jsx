import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DRIVER_LABELS, AWS_S3_REGIONS, backupBucketConsoleUrl } from '../lib/storageConfig.js';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { StorageCredentialsGuide } from '../components/StorageCredentialsGuide.jsx';
import {
  BrandingMigrationAssistant,
  BrandingMigrationBanner,
  useBrandingMigrationAssistant,
} from '../components/BrandingMigrationAssistant.jsx';

const FIELD_LABELS = {
  access_key_id: 'Access Key ID',
  secret_access_key: 'Secret Access Key',
};

function emptyForm(status) {
  return {
    driver: status?.driver === 'local' ? 's3' : status?.driver || 's3',
    key_prefix: status?.key_prefix || 'kunk/',
    s3: {
      bucket: status?.s3?.bucket || '',
      region: status?.s3?.region || 'us-east-1',
    },
    gcs: {
      bucket: status?.gcs?.bucket || '',
      project_id: status?.gcs?.project_id || '',
    },
    credentials: {
      storage_s3: {
        access_key_id: '',
        secret_access_key: '',
      },
      storage_gcs: {
        client_email: '',
        private_key: '',
      },
    },
  };
}

function emptyBackupForm(status) {
  return {
    enabled: Boolean(status?.backup?.enabled),
    schedule_time: status?.backup?.schedule_time || '22:00',
  };
}

function findCred(status, service, fieldKey) {
  const list = status?.credentials?.[service] || [];
  return list.find((c) => c.field_key === fieldKey) || {
    field_key: fieldKey,
    is_secret: true,
    has_value: false,
    value: null,
    description: FIELD_LABELS[fieldKey] || fieldKey,
  };
}

function parseServiceAccountJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON da service account inválido');
  }
  const clientEmail = String(parsed.client_email || '').trim();
  const privateKey = String(parsed.private_key || '').trim();
  if (!clientEmail || !privateKey) {
    throw new Error('JSON incompleto: precisa de client_email e private_key');
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: String(parsed.project_id || '').trim(),
  };
}

function formatBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return String(iso);
  }
}

function backupStatusMeta(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'success') {
    return { label: 'Sucesso', tone: 'success' };
  }
  if (key === 'failed' || key === 'error') {
    return { label: 'Falhou', tone: 'failed' };
  }
  if (key === 'running' || key === 'pending') {
    return { label: key === 'pending' ? 'Pendente' : 'Em andamento', tone: 'running' };
  }
  return { label: status || '—', tone: 'neutral' };
}

function backupOriginLabel(triggeredBy) {
  const key = String(triggeredBy || '').toLowerCase();
  if (key === 'manual') return 'Manual';
  if (key === 'cron' || key === 'schedule' || key === 'scheduled') return 'Agendado';
  if (!triggeredBy) return '—';
  return String(triggeredBy);
}

function StorageCredentialField({
  cred,
  value,
  editing,
  disabled,
  required,
  onChange,
  onStartEdit,
  onCancelEdit,
}) {
  const label = FIELD_LABELS[cred.field_key] || cred.description || cred.field_key;
  const showDisplay = cred.has_value && !editing;

  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label htmlFor={`storage-cred-${cred.field_key}`}>
        {label}
        {required ? ' *' : ''}
      </label>
      {showDisplay ? (
        <div className="cred-value-row" data-testid={`storage-cred-display-${cred.field_key}`}>
          <span className="cred-value-text">
            {cred.is_secret ? '••••••••' : cred.value || '—'}
          </span>
          <button
            type="button"
            className="cred-edit-link"
            disabled={disabled}
            data-testid={`storage-cred-edit-${cred.field_key}`}
            onClick={onStartEdit}
          >
            editar
          </button>
        </div>
      ) : (
        <div>
          <input
            id={`storage-cred-${cred.field_key}`}
            className="input"
            type={cred.is_secret ? 'password' : 'text'}
            autoComplete="off"
            required={required}
            disabled={disabled}
            placeholder={cred.has_value ? 'Nova chave' : ''}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {cred.has_value ? (
            <button
              type="button"
              className="cred-edit-link"
              style={{ marginTop: 6 }}
              disabled={disabled}
              onClick={onCancelEdit}
            >
              cancelar
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function StoragePage({ api }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [backupForm, setBackupForm] = useState(null);
  const [backups, setBackups] = useState([]);
  const [editing, setEditing] = useState({});
  const [loadError, setLoadError] = useState('');
  const [configError, setConfigError] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [backupConfigError, setBackupConfigError] = useState('');
  const [backupConfigMessage, setBackupConfigMessage] = useState('');
  const [backupRunError, setBackupRunError] = useState('');
  const [backupRunMessage, setBackupRunMessage] = useState('');
  const [backupListError, setBackupListError] = useState('');
  const [backupListMessage, setBackupListMessage] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [gcsUploading, setGcsUploading] = useState(false);
  const [replaceGcsFile, setReplaceGcsFile] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const gcsFileRef = useRef(null);
  const brandingAssistant = useBrandingMigrationAssistant();

  const applyStatusPayload = useCallback((data) => {
    setStatus(data);
    setBackupForm(emptyBackupForm(data));
    if (Array.isArray(data?.backups)) {
      setBackups(data.backups);
    }
  }, []);

  const reload = useCallback(async () => {
    const res = await api.getStorageStatus();
    applyStatusPayload(res.data);
    setForm((prev) => prev || emptyForm(res.data));
    try {
      const backupRes = await api.getStorageBackups();
      applyStatusPayload(backupRes.data);
      if (Array.isArray(backupRes.data?.backups)) {
        setBackups(backupRes.data.backups);
      }
    } catch {
      /* status já carregado */
    }
    return res.data;
  }, [api, applyStatusPayload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await reload();
        if (!cancelled) {
          setForm(emptyForm(data));
          setEditing({});
          setReplaceGcsFile(false);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!status || !form) return;
    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [status, form]);

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function setCredValue(service, fieldKey, value) {
    setForm((prev) => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [service]: {
          ...prev.credentials[service],
          [fieldKey]: value,
        },
      },
    }));
  }

  function startEdit(fieldKey) {
    setEditing((prev) => ({ ...prev, [fieldKey]: true }));
  }

  function cancelEdit(service, fieldKey) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    setCredValue(service, fieldKey, '');
  }

  function pickCredentialFields(service, fieldKeys, sourceForm = form, sourceEditing = editing) {
    const out = {};
    for (const key of fieldKeys) {
      const cred = findCred(status, service, key);
      const isEditing = Boolean(sourceEditing[key]);
      if (!cred.has_value || isEditing) {
        const v = sourceForm.credentials[service]?.[key];
        if (v != null && String(v).trim() !== '') {
          out[key] = v;
        }
      }
    }
    return out;
  }

  function buildPayload(overrides = {}) {
    const nextForm = overrides.form || form;
    const nextEditing = overrides.editing || editing;
    const driver = nextForm.driver;
    const payload = {
      driver,
      key_prefix: nextForm.key_prefix,
      s3: nextForm.s3,
      gcs: nextForm.gcs,
      credentials: {},
    };
    if (driver === 's3') {
      payload.credentials.storage_s3 = pickCredentialFields(
        'storage_s3',
        ['access_key_id', 'secret_access_key'],
        nextForm,
        nextEditing
      );
    } else if (driver === 'gcs') {
      const gcsCreds = {};
      const email = nextForm.credentials.storage_gcs?.client_email;
      const key = nextForm.credentials.storage_gcs?.private_key;
      if (email && String(email).trim()) gcsCreds.client_email = email;
      if (key && String(key).trim()) gcsCreds.private_key = key;
      payload.credentials.storage_gcs = gcsCreds;
    }
    return payload;
  }

  function applySavedStatus(nextStatus, keepDriver) {
    applyStatusPayload(nextStatus);
    setForm({
      ...emptyForm(nextStatus),
      driver: keepDriver || nextStatus.driver || 's3',
    });
    setEditing({});
    setReplaceGcsFile(false);
  }

  function hasCredentialValue(service, fieldKey) {
    const cred = findCred(status, service, fieldKey);
    if (editing[fieldKey]) {
      const v = form.credentials?.[service]?.[fieldKey];
      return Boolean(v && String(v).trim());
    }
    if (cred.has_value) return true;
    const v = form.credentials?.[service]?.[fieldKey];
    return Boolean(v && String(v).trim());
  }

  /**
   * Valida campos obrigatórios antes de testar/ativar.
   * @returns {string|null} mensagem de erro ou null se ok
   */
  function validateConfigForm(sourceForm = form) {
    if (!sourceForm || sourceForm.driver === 'local') {
      return 'Selecione Amazon S3 ou Google Cloud Storage';
    }
    if (!String(sourceForm.key_prefix || '').trim()) {
      return 'Informe o prefixo das keys';
    }

    if (sourceForm.driver === 's3') {
      if (!String(sourceForm.s3?.bucket || '').trim()) {
        return 'Informe o nome do bucket';
      }
      if (!String(sourceForm.s3?.region || '').trim()) {
        return 'Selecione a região';
      }
      if (!hasCredentialValue('storage_s3', 'access_key_id')) {
        return 'Informe o Access Key ID';
      }
      if (!hasCredentialValue('storage_s3', 'secret_access_key')) {
        return 'Informe o Secret Access Key';
      }
      return null;
    }

    if (sourceForm.driver === 'gcs') {
      if (!String(sourceForm.gcs?.bucket || '').trim()) {
        return 'Informe o nome do bucket';
      }
      const gcsHasCreds = Boolean(status?.gcs?.has_credentials);
      const email = sourceForm.credentials?.storage_gcs?.client_email;
      const key = sourceForm.credentials?.storage_gcs?.private_key;
      const hasNewPair = Boolean(email && String(email).trim() && key && String(key).trim());
      if (!gcsHasCreds && !hasNewPair) {
        return 'Envie o JSON da service account';
      }
      return null;
    }

    return 'Provedor inválido';
  }

  async function runTestAndSave(payload, keepDriver) {
    setTestBusy(true);
    setBusy(true);
    setConfigError('');
    setConfigMessage('');
    try {
      const res = await api.testStorage(payload);
      if (res.data?.status) {
        applySavedStatus(res.data.status, keepDriver || payload.driver);
        brandingAssistant.maybeOpenAfterActivate(res.data.status);
      } else {
        const data = await reload();
        setEditing({});
        setReplaceGcsFile(false);
        brandingAssistant.maybeOpenAfterActivate(data);
      }
      setConfigMessage(res.data?.message || 'Teste OK — bucket ativado');
      try {
        const backupRes = await api.getStorageBackups();
        applyStatusPayload(backupRes.data);
        if (Array.isArray(backupRes.data?.backups)) setBackups(backupRes.data.backups);
      } catch {
        /* ignore */
      }
      return true;
    } catch (err) {
      setConfigError(err.message);
      return false;
    } finally {
      setTestBusy(false);
      setBusy(false);
    }
  }

  async function onMigrateBranding() {
    brandingAssistant.setMigrateBusy(true);
    brandingAssistant.setMigrateError('');
    brandingAssistant.setMigrateMessage('');
    try {
      const res = await api.migrateBrandingAssets();
      brandingAssistant.setMigrateMessage(res.data?.message || 'Logo enviada para o bucket');
      const nextStatus = await reload();
      if (res.data?.branding_migration) {
        applyStatusPayload({
          ...nextStatus,
          branding_migration: res.data.branding_migration,
        });
      }
    } catch (err) {
      brandingAssistant.setMigrateError(err.message || 'Falha ao migrar logo');
    } finally {
      brandingAssistant.setMigrateBusy(false);
    }
  }

  async function onTest() {
    const validationError = validateConfigForm();
    if (validationError) {
      setConfigError(validationError);
      setConfigMessage('');
      return;
    }
    await runTestAndSave(buildPayload(), form.driver);
  }

  function ensureGcsBucketFilled() {
    if (form.gcs.bucket?.trim()) return true;
    setConfigError('Informe o nome do bucket antes de enviar a service account');
    setConfigMessage('');
    return false;
  }

  function onGcsFileClick(e) {
    if (!ensureGcsBucketFilled()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function openGcsFilePicker() {
    setConfigError('');
    if (!ensureGcsBucketFilled()) return;
    gcsFileRef.current?.click();
  }

  async function onGcsJsonFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setConfigError('');
    setConfigMessage('');

    if (!ensureGcsBucketFilled()) return;
    if (!String(form.key_prefix || '').trim()) {
      setConfigError('Informe o prefixo das keys');
      return;
    }

    setGcsUploading(true);
    try {
      const text = await file.text();
      const extracted = parseServiceAccountJson(text);
      const nextForm = {
        ...form,
        driver: 'gcs',
        gcs: {
          ...form.gcs,
          project_id: extracted.project_id || form.gcs.project_id || '',
        },
        credentials: {
          ...form.credentials,
          storage_gcs: {
            client_email: extracted.client_email,
            private_key: extracted.private_key,
          },
        },
      };
      setForm(nextForm);
      setConfigMessage(`Arquivo lido (${file.name}). Testando conexão…`);
      setGcsUploading(false);

      const payload = buildPayload({
        form: nextForm,
        editing: { client_email: true, private_key: true },
      });
      await runTestAndSave(payload, 'gcs');
    } catch (err) {
      setConfigError(err.message || 'Falha ao processar o arquivo');
      setGcsUploading(false);
    }
  }

  async function onSaveBackupConfig() {
    setBackupBusy(true);
    setBackupConfigError('');
    setBackupConfigMessage('');
    try {
      const res = await api.putBackupConfig({
        enabled: backupForm.enabled,
        schedule_time: backupForm.schedule_time,
      });
      applyStatusPayload(res.data);
      if (Array.isArray(res.data?.backups)) setBackups(res.data.backups);
      setBackupConfigMessage('Configuração de backup salva');
    } catch (err) {
      setBackupConfigError(err.message);
    } finally {
      setBackupBusy(false);
    }
  }

  async function onRunBackup() {
    setRunBusy(true);
    setBackupRunError('');
    setBackupRunMessage('');
    try {
      await api.runStorageBackup();
      setBackupRunMessage('Backup concluído');
      await reload();
    } catch (err) {
      setBackupRunError(err.message);
      await reload().catch(() => {});
    } finally {
      setRunBusy(false);
    }
  }

  async function onDeleteBackup(id) {
    if (!window.confirm('Excluir este backup do bucket e do histórico?')) return;
    setBackupListError('');
    setBackupListMessage('');
    try {
      await api.deleteStorageBackup(id);
      setBackupListMessage('Backup excluído');
      await reload();
    } catch (err) {
      setBackupListError(err.message);
    }
  }

  async function onConfirmRestore() {
    if (!restoreTarget || restoreConfirmText !== 'RESTAURAR') return;
    setRestoreBusy(true);
    setRestoreError('');
    try {
      const res = await api.restoreStorageBackup(restoreTarget.id, { confirm: true });
      setBackupListMessage(res.data?.message || 'Restore concluído');
      setRestoreTarget(null);
      setRestoreConfirmText('');
      await reload();
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoreBusy(false);
    }
  }

  if (!status || !form || !backupForm) {
    return <AdminLoader label="Carregando armazenamento…" />;
  }

  const readOnlyProvider = status.is_cloud && !status.can_change_provider;
  const gcsHasCreds = Boolean(status.gcs?.has_credentials);
  const backupEditable = Boolean(status.backup?.editable);
  const showBackupCard = form.driver !== 'local' || status.is_cloud;
  const driverLabel = DRIVER_LABELS[status.driver] || status.driver;
  const brandingMigration = status.branding_migration;
  const showBrandingBanner =
    status.is_cloud &&
    brandingMigration?.needs_assistant &&
    !brandingAssistant.dismissed &&
    !brandingAssistant.assistantOpen;

  const s3Fields = [
    { key: 'access_key_id' },
    { key: 'secret_access_key' },
  ];

  return (
    <div>
      <h1>Armazenamento e Backup</h1>
      <p className="muted">
        Configure o bucket de arquivos (Amazon S3 ou Google Cloud Storage) e os backups diários
        SQL + JSON. O download continua via
        {' '}
        <span className="mono">/api/v1/files/:id/download</span>
        {' '}
        — o bucket fica privado e a API acessa com as credenciais.
      </p>

      {showBrandingBanner ? (
        <BrandingMigrationBanner
          brandingMigration={brandingMigration}
          driverLabel={driverLabel}
          busy={brandingAssistant.migrateBusy}
          onOpen={brandingAssistant.openAssistant}
        />
      ) : null}

      <BrandingMigrationAssistant
        open={brandingAssistant.assistantOpen}
        brandingMigration={brandingMigration}
        driverLabel={driverLabel}
        busy={brandingAssistant.migrateBusy}
        error={brandingAssistant.migrateError}
        message={brandingAssistant.migrateMessage}
        onMigrate={onMigrateBranding}
        onDismiss={brandingAssistant.dismissAssistant}
        onClose={brandingAssistant.closeAssistant}
      />

      <div className="card" style={{ marginBottom: '1rem' }} data-testid="storage-status-card" id="storage-status">
        <h2>Status</h2>
        <p>
          <strong>Driver ativo:</strong>
          {' '}
          {DRIVER_LABELS[status.driver] || status.driver}
        </p>
        {status.cloud_files_count > 0 ? (
          <p className="alert alert-info" style={{ marginTop: '0.75rem' }}>
            Já existem arquivos neste bucket. Você pode alterar o nome do bucket do mesmo provedor
            (S3 ou GCS). Trocar de provedor só é permitido se não houver arquivos na nuvem.
          </p>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }} data-testid="storage-config-card" id="storage-config">
        <h2>Configuração</h2>
        <div className="ext-form-grid">
          <div>
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="storage-driver">Provedor *</label>
              <select
                id="storage-driver"
                value={form.driver}
                disabled={readOnlyProvider || busy}
                onChange={(e) => updateForm({ driver: e.target.value })}
              >
                {!status.is_cloud ? <option value="local">Disco local (padrão)</option> : null}
                <option value="s3">Amazon S3</option>
                <option value="gcs">Google Cloud Storage</option>
              </select>
            </div>

            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="key-prefix">Prefixo das keys *</label>
              <input
                id="key-prefix"
                className="mono"
                value={form.key_prefix}
                disabled={busy}
                required
                onChange={(e) => updateForm({ key_prefix: e.target.value })}
              />
            </div>

            {form.driver === 's3' ? (
              <>
                <div className="field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="s3-bucket">Bucket *</label>
                  <input
                    id="s3-bucket"
                    value={form.s3.bucket}
                    disabled={busy}
                    required
                    onChange={(e) => updateForm({ s3: { ...form.s3, bucket: e.target.value } })}
                  />
                </div>
                <div className="field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="s3-region">Região *</label>
                  <select
                    id="s3-region"
                    value={form.s3.region}
                    disabled={busy}
                    required
                    onChange={(e) => updateForm({ s3: { ...form.s3, region: e.target.value } })}
                  >
                    {!AWS_S3_REGIONS.some((r) => r.value === form.s3.region) && form.s3.region ? (
                      <option value={form.s3.region}>{form.s3.region} (atual)</option>
                    ) : null}
                    {AWS_S3_REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {s3Fields.map(({ key }) => {
                  const cred = findCred(status, 'storage_s3', key);
                  return (
                    <StorageCredentialField
                      key={key}
                      cred={cred}
                      value={form.credentials.storage_s3[key]}
                      editing={Boolean(editing[key])}
                      disabled={busy}
                      required
                      onChange={(v) => setCredValue('storage_s3', key, v)}
                      onStartEdit={() => {
                        startEdit(key);
                        setCredValue('storage_s3', key, '');
                      }}
                      onCancelEdit={() => cancelEdit('storage_s3', key)}
                    />
                  );
                })}
              </>
            ) : null}

            {form.driver === 'gcs' ? (
              <>
                <div className="field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="gcs-bucket">Bucket *</label>
                  <input
                    id="gcs-bucket"
                    value={form.gcs.bucket}
                    disabled={busy}
                    required
                    onChange={(e) => updateForm({ gcs: { ...form.gcs, bucket: e.target.value } })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label htmlFor="gcs-sa-file">Service account (JSON) *</label>
                  {gcsHasCreds && !replaceGcsFile ? (
                    <div className="cred-value-row">
                      <span className="cred-value-text">••••••••</span>
                      <button
                        type="button"
                        className="cred-edit-link"
                        disabled={busy}
                        onClick={() => setReplaceGcsFile(true)}
                      >
                        editar
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={gcsFileRef}
                        id="gcs-sa-file"
                        type="file"
                        accept="application/json,.json"
                        disabled={busy || gcsUploading}
                        style={{ display: 'none' }}
                        onClick={onGcsFileClick}
                        onChange={onGcsJsonFile}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || gcsUploading}
                        onClick={openGcsFilePicker}
                      >
                        {gcsUploading ? 'Enviando…' : 'Enviar arquivo JSON'}
                      </button>
                      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                        Preencha o bucket antes. O arquivo não é armazenado — extraímos client_email,
                        private_key e project_id, testamos e só então salvamos as credenciais.
                      </p>
                      {gcsHasCreds ? (
                        <button
                          type="button"
                          className="cred-edit-link"
                          style={{ marginTop: 6 }}
                          disabled={busy}
                          onClick={() => setReplaceGcsFile(false)}
                        >
                          cancelar
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            <div className="field" style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {form.driver !== 'local' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || gcsUploading}
                      onClick={onTest}
                    >
                      {testBusy ? (
                        <>
                          <span className="spinner spinner-inline" aria-hidden="true" />
                          Testando e ativando…
                        </>
                      ) : (
                        'Testar e ativar'
                      )}
                    </button>
                    {form.driver === 'gcs' && gcsUploading ? (
                      <span className="muted" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span className="spinner spinner-inline" aria-hidden="true" />
                        Lendo arquivo…
                      </span>
                    ) : null}
                    {form.driver === 'gcs' && !gcsHasCreds ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Informe o bucket e envie o JSON da service account (ou use Testar e ativar após o
                        upload).
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Selecione S3 ou GCS para configurar o armazenamento em nuvem.
                  </p>
                )}
              </div>
              {configError ? (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                  {configError}
                </div>
              ) : null}
              {configMessage ? (
                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                  {configMessage}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            {form.driver === 's3' || form.driver === 'gcs' ? (
              <StorageCredentialsGuide
                provider={form.driver}
                bucket={form.driver === 's3' ? form.s3.bucket : form.gcs.bucket}
                keyPrefix={form.key_prefix}
              />
            ) : (
              <p className="muted">Selecione S3 ou GCS para ver o guia de credenciais.</p>
            )}
          </div>
        </div>
      </div>

      {showBackupCard ? (
        <div
          className="card"
          style={{ marginBottom: '1rem' }}
          data-testid="storage-backup-card"
          id="backup"
        >
          <h2>Backup</h2>
          {!backupEditable ? (
            <p className="muted">
              Ative o bucket para configurar backups. Ao ativar, o módulo é ligado automaticamente com
              horário 22:00 (America/Sao_Paulo) e retenção de 10 backups.
            </p>
          ) : null}

          <div className="ext-form-grid" style={{ opacity: backupEditable ? 1 : 0.55 }}>
            <div className="field">
              <label htmlFor="backup-enabled">Backup diário</label>
              <select
                id="backup-enabled"
                disabled={!backupEditable || backupBusy || busy}
                value={backupForm.enabled ? 'true' : 'false'}
                onChange={(e) =>
                  setBackupForm((prev) => ({ ...prev, enabled: e.target.value === 'true' }))
                }
              >
                <option value="true">Ativado</option>
                <option value="false">Desativado</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="backup-time">Horário (America/Sao_Paulo)</label>
              <input
                id="backup-time"
                type="time"
                disabled={!backupEditable || backupBusy || busy}
                value={backupForm.schedule_time}
                onChange={(e) =>
                  setBackupForm((prev) => ({ ...prev, schedule_time: e.target.value }))
                }
              />
            </div>
            <div className="field field--wide">
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={!backupEditable || backupBusy || busy}
                  onClick={onSaveBackupConfig}
                >
                  {backupBusy ? 'Salvando…' : 'Salvar configuração'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!backupEditable || !backupForm.enabled || runBusy || busy}
                  onClick={onRunBackup}
                  data-testid="storage-backup-run"
                >
                  {runBusy ? (
                    <>
                      <span className="spinner spinner-inline" aria-hidden="true" />
                      Gerando backup…
                    </>
                  ) : (
                    'Realizar backup agora'
                  )}
                </button>
              </div>
              {backupConfigError ? (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                  {backupConfigError}
                </div>
              ) : null}
              {backupConfigMessage ? (
                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                  {backupConfigMessage}
                </div>
              ) : null}
              {backupRunError ? (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                  {backupRunError}
                </div>
              ) : null}
              {backupRunMessage ? (
                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                  {backupRunMessage}
                </div>
              ) : null}
            </div>
          </div>

          <div className="backup-list-head">
            <h3 className="backup-list-title">Últimos backups</h3>
            <span className="backup-list-count muted">
              {backups.length === 0
                ? 'Nenhum registro'
                : `${backups.length} ${backups.length === 1 ? 'registro' : 'registros'}`}
            </span>
          </div>
          {backups.length === 0 ? (
            <div className="backup-list-empty">
              <p className="muted" style={{ margin: 0 }}>
                Nenhum backup registrado ainda.
              </p>
            </div>
          ) : (
            <div className="backup-list-wrap table-wrap">
              <table className="data backup-list" data-testid="storage-backup-list">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Status</th>
                    <th>Tamanho</th>
                    <th>Origem</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => {
                    const bucketUrl = backupBucketConsoleUrl({
                      driver: status.driver,
                      status,
                      backup: b,
                    });
                    const statusMeta = backupStatusMeta(b.status);
                    return (
                      <tr key={b.id} className={`backup-row backup-row--${statusMeta.tone}`}>
                        <td>
                          <div className="backup-date">{formatDate(b.created_at)}</div>
                          {b.prefix ? (
                            <div className="backup-prefix mono muted" title={b.prefix}>
                              {b.prefix.replace(/^backups\//, '').replace(/\/$/, '')}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className={`backup-status backup-status--${statusMeta.tone}`}>
                            <span className="backup-status-dot" aria-hidden="true" />
                            {statusMeta.label}
                          </span>
                          {b.error ? (
                            <div className="backup-error" title={b.error}>
                              {b.error}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="backup-size mono">{formatBytes(b.size_bytes)}</span>
                        </td>
                        <td>
                          <span className="backup-origin">{backupOriginLabel(b.triggered_by)}</span>
                        </td>
                        <td>
                          <div className="backup-actions">
                            <button
                              type="button"
                              className="btn backup-action-btn"
                              disabled={
                                !backupEditable ||
                                b.status !== 'success' ||
                                !bucketUrl ||
                                busy
                              }
                              title={
                                bucketUrl
                                  ? 'Abrir pasta do backup no console do bucket'
                                  : 'Bucket ou prefixo indisponível'
                              }
                              onClick={() => {
                                if (!bucketUrl) return;
                                window.open(bucketUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Abrir no bucket
                            </button>
                            <button
                              type="button"
                              className="btn backup-action-btn"
                              disabled={!backupEditable || b.status !== 'success' || busy}
                              onClick={() => {
                                setRestoreError('');
                                setRestoreTarget(b);
                                setRestoreConfirmText('');
                              }}
                            >
                              Restaurar
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger backup-action-btn"
                              disabled={!backupEditable || busy}
                              onClick={() => onDeleteBackup(b.id)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {backupListError ? (
            <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
              {backupListError}
            </div>
          ) : null}
          {backupListMessage ? (
            <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
              {backupListMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      {restoreTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-backup-title"
          className="card"
          style={{
            position: 'fixed',
            inset: '20% 50% auto 50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            maxWidth: 480,
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}
        >
          <h2 id="restore-backup-title" style={{ marginTop: 0 }}>
            Restaurar backup
          </h2>
          <p className="alert alert-error">
            Esta operação sobrescreve o banco de dados atual com o SQL do backup
            {' '}
            <span className="mono">{formatDate(restoreTarget.created_at)}</span>
            . Não pode ser desfeita automaticamente.
          </p>
          <div className="field">
            <label htmlFor="restore-confirm">Digite RESTAURAR para confirmar</label>
            <input
              id="restore-confirm"
              className="input"
              value={restoreConfirmText}
              disabled={restoreBusy}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={restoreBusy || restoreConfirmText !== 'RESTAURAR'}
              onClick={onConfirmRestore}
            >
              {restoreBusy ? 'Restaurando…' : 'Confirmar restore'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={restoreBusy}
              onClick={() => {
                setRestoreTarget(null);
                setRestoreConfirmText('');
                setRestoreError('');
              }}
            >
              Cancelar
            </button>
          </div>
          {restoreError ? (
            <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
              {restoreError}
            </div>
          ) : null}
        </div>
      ) : null}

      {loadError ? (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
