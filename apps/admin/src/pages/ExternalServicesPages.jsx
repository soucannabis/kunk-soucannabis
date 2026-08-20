import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { PhoneInput, onlyDigits } from '@kunk/forms';
import {
  getGoogleCalendarOAuthStatus,
  getMelhorEnvioOAuthStatus,
  loadExternalService,
  loadExternalServices,
  saveExternalCredentials,
  saveExternalServiceFlags,
  sendExternalTestEmail,
  startGoogleCalendarOAuth,
  startMelhorEnvioOAuth,
  testExternalService,
} from '../lib/externalServicesConfig.js';
import { AdminLoader } from '../components/AdminLoader.jsx';
import {
  ExternalServiceStatusBanner,
  ExternalServiceStatusIcon,
  ExtActionFeedback,
} from '../components/ExternalServiceStatus.jsx';
import {
  EXT_FREIGHT_SLUGS,
  EXT_SERVICE_LABELS,
  deriveExternalServiceStatus,
  deriveShippingStatus,
  isExternalServiceAuthenticated,
} from '../lib/externalServiceStatus.js';
import { CredentialsSetupGuide } from '../components/CredentialsSetupGuide.jsx';

function notifyExternalServicesChanged() {
  window.dispatchEvent(new CustomEvent('kunk:external-services-changed'));
}

function AuthKeyIcon() {
  return (
    <svg
      className="btn-auth-key-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M10.5 10.5 20 20M16.5 15.5h3M14.75 17.25h2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Botão Autenticar / Reautenticar com ícone de chave. */
function AuthenticateButton({ busy, label, disabled, ...rest }) {
  const text = busy ? 'Autenticando…' : label || 'Autenticar';
  return (
    <button
      type="submit"
      className="btn btn-primary"
      data-testid="save-credentials"
      disabled={disabled || busy}
      {...rest}
    >
      {!busy ? <AuthKeyIcon /> : null}
      {text}
    </button>
  );
}

const ME_DEFAULT_URLS = {
  production: 'https://www.melhorenvio.com.br/api/v2',
};

const HIDDEN_CRED_FIELDS = new Set([
  'access_token',
  'refresh_token',
  'environment',
  'api_base_url',
  'redirect_uri',
]);

/** Pagar.me: webhooks ficam fora do bloco “Autenticar”. */
const PAGARME_WEBHOOK_FIELDS = new Set(['webhook_user', 'webhook_pass']);
const PAGARME_AUTH_FIELDS = new Set(['secret_key', 'public_key', 'api_base_url']);
const PAGARME_DEFAULT_API_BASE = 'https://api.pagar.me/core/v5/';

const FIELD_LABELS = {
  client_id: 'Client ID',
  client_secret: 'Client Secret',
  redirect_uri: 'Redirect URI (callback OAuth)',
  api_base_url: 'API base URL',
  company_id: 'Company ID',
  token_url: 'Token URL',
  api_key: 'API Key',
  host: 'Host SMTP',
  port: 'Porta',
  secure: 'TLS implícito (secure)',
  user: 'Usuário SMTP',
  pass: 'Senha',
  from_email: 'E-mail remetente (From)',
  from_name: 'Nome do remetente',
  secret_key: 'Secret key (sk_… / sk_test_…) — obrigatória',
  public_key: 'Public key (pk_… / pk_test_…) — opcional',
  webhook_user: 'Usuário HTTP Basic — cadastre o mesmo no painel Pagar.me (webhook autenticado)',
  webhook_pass: 'Senha HTTP Basic — cadastre a mesma no painel Pagar.me (webhook autenticado)',
  base_url: 'Base URL SouCannabis',
  api_token: 'Token Utalk (Bearer)',
  organization_id: 'Organization ID',
  from_phone: 'Telefone do canal (+55…)',
};

const FIELD_PLACEHOLDERS = {
  client_id: 'Ex.: abc123def456',
  client_secret: 'Cole o client secret',
  redirect_uri: 'https://…/oauth/callback',
  api_base_url: 'https://api.exemplo.com',
  company_id: 'Ex.: 123456',
  token_url: 'https://api.exemplo.com/oauth/token',
  api_key: 'Cole a API key',
  host: 'smtp.exemplo.com',
  port: '587',
  user: 'smtp-user',
  pass: 'Senha SMTP',
  from_email: 'noreply@exemplo.com',
  from_name: 'Nome da associação',
  secret_key: 'sk_… ou sk_test_…',
  public_key: 'pk_… ou pk_test_…',
  webhook_user: 'Usuário Basic Auth (Pagar.me)',
  webhook_pass: 'Senha Basic Auth (Pagar.me)',
  base_url: 'https://api.soucannabis.exemplo',
  api_token: 'Cole o token Bearer',
  organization_id: 'Ex.: org_abc123',
  from_phone: '+5562999999999',
};

function credentialPlaceholder(fieldKey, isSecret, serviceName) {
  if (serviceName === 'pagarme' && fieldKey === 'api_base_url') return PAGARME_DEFAULT_API_BASE;
  if (FIELD_PLACEHOLDERS[fieldKey]) return FIELD_PLACEHOLDERS[fieldKey];
  if (isSecret) return 'Cole o valor secreto';
  return 'Preencha este campo';
}

const FREIGHT_SERVICES = new Set(['loggi', 'melhorenvio']);
const SERVICE_LABELS = {
  ...EXT_SERVICE_LABELS,
  email: 'E-mail (SMTP)',
  utalk: 'Utalk (WhatsApp)',
};

const SC_AUTH_FIELDS = new Set(['base_url', 'token_url', 'client_id', 'client_secret']);

/** Mensagem rica para erros de Autenticar (code + etapa + HTTP remoto). */
function formatExternalAuthError(err) {
  if (!err) return 'Teste falhou — nada foi persistido';
  if (err.status === 401 || /Sessão inválida/i.test(err.message || '')) {
    return 'Sessão do Admin expirada — faça login novamente e clique em Autenticar.';
  }
  const parts = [];
  if (err.code) parts.push(`[${err.code}]`);
  parts.push(err.message || 'Teste falhou — nada foi persistido');
  const d = err.details;
  if (d && typeof d === 'object') {
    const extras = [];
    if (d.step) extras.push(`etapa=${d.step}`);
    if (d.token_url) extras.push(`token_url=${d.token_url}`);
    if (d.base_url) extras.push(`base_url=${d.base_url}`);
    if (d.url) extras.push(`url=${d.url}`);
    const remoteStatus = d.remote_status ?? d.status;
    if (remoteStatus != null) extras.push(`HTTP remoto=${remoteStatus}`);
    if (Array.isArray(d.missing) && d.missing.length) {
      extras.push(`faltando=${d.missing.join(',')}`);
    }
    if (d.remote_message) extras.push(`remoto=${d.remote_message}`);
    if (d.payment_percentage != null) extras.push(`payment_percentage=${d.payment_percentage}`);
    if (extras.length) parts.push(`(${extras.join(' · ')})`);
  }
  return parts.join(' ');
}

export function ExternalServicesShell() {
  return <Outlet />;
}

export function ExternalServicesIndexPage({ api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadExternalServices(api);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) {
    return (
      <div className="ext-page">
        <div className="admin-top">
          <div>
            <h1 style={{ margin: 0 }}>Serviços externos</h1>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>Visão geral dos provedores</p>
          </div>
        </div>
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      </div>
    );
  }
  if (!data) return <AdminLoader />;

  const shippingStatus = deriveShippingStatus(data.store_incomplete);
  const freightSet = new Set(EXT_FREIGHT_SLUGS);
  const freightServices = (data.services || []).filter((s) => freightSet.has(s.service));
  const otherServices = (data.services || []).filter((s) => !freightSet.has(s.service));

  return (
    <div className="ext-page ext-page-wide">
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Serviços externos</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Visão geral dos provedores — abra cada um no menu lateral
          </p>
        </div>
      </div>

      <h2 className="ext-overview-heading">Transportadoras</h2>
      <div className="ext-overview-grid">
        <Link to="/servicos-externos/envio" className="ext-overview-card">
          <div className="ext-overview-card-head">
            <ExternalServiceStatusIcon kind={shippingStatus.kind} label={shippingStatus.label} />
            <strong>Dados de envio</strong>
          </div>
          <span className="muted">{shippingStatus.detail}</span>
        </Link>
        {freightServices.map((s) => {
          const status = deriveExternalServiceStatus(s);
          return (
            <Link
              key={s.service}
              to={`/servicos-externos/${s.service}`}
              className="ext-overview-card"
            >
              <div className="ext-overview-card-head">
                <ExternalServiceStatusIcon kind={status.kind} label={status.label} />
                <strong>{SERVICE_LABELS[s.service] || s.service}</strong>
              </div>
              <span className="muted">
                {status.label} · {s.enabled ? 'habilitado' : 'desabilitado'}
                {s.source === 'admin' ? ' · Admin' : ' · padrão'}
              </span>
            </Link>
          );
        })}
      </div>

      <h2 className="ext-overview-heading">Outros serviços</h2>
      <div className="ext-overview-grid">
        {otherServices.map((s) => {
          const status = deriveExternalServiceStatus(s);
          return (
            <Link
              key={s.service}
              to={`/servicos-externos/${s.service}`}
              className="ext-overview-card"
            >
              <div className="ext-overview-card-head">
                <ExternalServiceStatusIcon kind={status.kind} label={status.label} />
                <strong>{SERVICE_LABELS[s.service] || s.service}</strong>
              </div>
              <span className="muted">
                {status.label} · {s.enabled ? 'habilitado' : 'desabilitado'}
                {s.source === 'admin' ? ' · Admin' : ' · padrão'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const GOOGLE_CALENDAR_FORM_CREDS = [
  {
    field_key: 'client_id',
    is_secret: true,
    has_value: false,
    value: null,
    description: 'Google OAuth Client ID',
  },
  {
    field_key: 'client_secret',
    is_secret: true,
    has_value: false,
    value: null,
    description: 'Google OAuth Client Secret',
  },
];

const EMAIL_FORM_CREDS = [
  { field_key: 'host', is_secret: false, has_value: false, value: null, description: 'Servidor SMTP' },
  { field_key: 'port', is_secret: false, has_value: false, value: '587', description: 'Porta SMTP' },
  { field_key: 'secure', is_secret: false, has_value: false, value: 'false', description: 'TLS implícito' },
  { field_key: 'user', is_secret: false, has_value: false, value: null, description: 'Usuário SMTP' },
  { field_key: 'pass', is_secret: true, has_value: false, value: null, description: 'Senha SMTP' },
  { field_key: 'from_email', is_secret: false, has_value: false, value: null, description: 'E-mail remetente' },
  { field_key: 'from_name', is_secret: false, has_value: false, value: null, description: 'Nome do remetente' },
];

function CredentialField({
  cred,
  value,
  editing,
  onChange,
  onStartEdit,
  onCancelEdit,
  envSuffix,
  alwaysEditable = false,
  className = '',
  serviceName = '',
}) {
  const label = FIELD_LABELS[cred.field_key] || cred.description || cred.field_key;
  const fieldClass = `field${className ? ` ${className}` : ''}`;

  if (cred.field_key === 'secure') {
    const current = String(value ?? cred.value ?? 'false').toLowerCase();
    const isYes = current === 'true' || current === '1' || current === 'yes' || current === 'on';
    return (
      <fieldset className={fieldClass} style={{ border: 0, padding: 0 }} data-testid="cred-secure">
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>{label}{envSuffix || ''}</legend>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name={`cred-${cred.field_key}`}
              checked={isYes}
              onChange={() => onChange('true')}
            />
            Sim
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name={`cred-${cred.field_key}`}
              checked={!isYes}
              onChange={() => onChange('false')}
            />
            Não
          </label>
        </div>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
          Use Sim na porta 465 (TLS implícito). Na 587 use Não (STARTTLS).
        </p>
      </fieldset>
    );
  }

  const showDisplay = !alwaysEditable && cred.has_value && !editing;

  return (
    <div className={fieldClass}>
      <label htmlFor={`cred-${cred.field_key}`}>
        {label}
        {envSuffix || ''}
      </label>
      {showDisplay ? (
        <div className="cred-value-row" data-testid={`cred-display-${cred.field_key}`}>
          <span className="cred-value-text">
            {cred.is_secret ? '••••••••' : cred.value || value || '—'}
          </span>
          <button
            type="button"
            className="cred-edit-link"
            data-testid={`cred-edit-${cred.field_key}`}
            onClick={onStartEdit}
          >
            editar
          </button>
        </div>
      ) : (
        <div>
          {cred.field_key === 'from_phone' ? (
            <>
              <PhoneInput
                value={onlyDigits(value || '')}
                onChange={(digits) => onChange(digits ? `+${digits}` : '')}
                inputClass="input admin-phone-control"
                placeholder={credentialPlaceholder(cred.field_key, false, serviceName)}
                inputProps={{
                  id: `cred-${cred.field_key}`,
                  name: 'from_phone',
                  'data-testid': `cred-${cred.field_key}`,
                  autoComplete: 'tel',
                  placeholder: credentialPlaceholder(cred.field_key, false, serviceName),
                }}
              />
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                Obrigatório antes de autenticar. Salvo com código do país (ex.:{' '}
                <code>+5562999999999</code>).
              </p>
            </>
          ) : (
            <input
              id={`cred-${cred.field_key}`}
              className="input"
              type={
                serviceName === 'email' && cred.field_key === 'user'
                  ? 'text'
                  : cred.is_secret
                    ? 'password'
                    : cred.field_key.includes('url')
                      ? 'url'
                      : 'text'
              }
              data-testid={`cred-${cred.field_key}`}
              placeholder={credentialPlaceholder(cred.field_key, cred.is_secret, serviceName)}
              autoComplete={cred.field_key === 'pass' ? 'new-password' : 'off'}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
          {cred.has_value && !alwaysEditable && (
            <button
              type="button"
              className="cred-edit-link"
              style={{ marginTop: 6 }}
              onClick={onCancelEdit}
            >
              cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopyableUrlRow({ label, url, testId }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ marginBottom: 10 }} data-testid={testId}>
      <div style={{ fontSize: '0.8rem', marginBottom: 4, color: 'var(--admin-text)' }}>{label}</div>
      <div className="cred-value-row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <code style={{ wordBreak: 'break-all', flex: 1, fontSize: '0.85rem', color: '#fff' }}>
          {url}
        </code>
        <button
          type="button"
          className="btn-icon"
          title={copied ? 'Copiado' : 'Copiar'}
          aria-label={copied ? 'Copiado' : `Copiar ${label}`}
          onClick={onCopy}
          style={{ flexShrink: 0 }}
        >
          {copied ? '✓' : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function OAuthRedirectUriCopy({ uri }) {
  const [copied, setCopied] = useState(false);
  if (!uri) return null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="field field--wide" data-testid="oauth-redirect-uri">
      <label>Redirect URI (copie para o provedor OAuth)</label>
      <div className="cred-value-row">
        <span className="cred-value-text" style={{ wordBreak: 'break-all' }}>
          {uri}
        </span>
        <button type="button" className="cred-edit-link" onClick={onCopy}>
          {copied ? 'copiado' : 'copiar'}
        </button>
      </div>
      <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
        Cadastre esta URI exatamente igual no console do provedor. O sistema grava automaticamente —
        não é necessário colar no formulário.
      </p>
    </div>
  );
}

export function ExternalServiceDetailPage({ api }) {
  const { service } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [fields, setFields] = useState({});
  const [editing, setEditing] = useState({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [feedbackAt, setFeedbackAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [outboundCreds, setOutboundCreds] = useState(null);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [pagarmeForceEdit, setPagarmeForceEdit] = useState(false);
  const [assocRecipientDraft, setAssocRecipientDraft] = useState('');
  const [utalkIdDrafts, setUtalkIdDrafts] = useState({});
  const [utalkAttendantSaving, setUtalkAttendantSaving] = useState(null);
  const [triageMessageDraft, setTriageMessageDraft] = useState(
    'Olá {{nome}}, recebemos seu contato. Em breve um atendente falará com você.'
  );
  const [triageMessageSaving, setTriageMessageSaving] = useState(false);
  const oauthWaitRef = useRef(null);

  function reportError(at, message) {
    setFeedbackAt(at);
    setError(message || 'Falha');
    setMsg('');
  }

  function reportMsg(at, message) {
    setFeedbackAt(at);
    setMsg(message || '');
    setError('');
  }

  function clearFeedback() {
    setFeedbackAt(null);
    setError('');
    setMsg('');
  }

  function stopOauthWait() {
    if (oauthWaitRef.current) {
      clearInterval(oauthWaitRef.current.interval);
      clearTimeout(oauthWaitRef.current.timeout);
      window.removeEventListener('message', oauthWaitRef.current.onMessage);
      oauthWaitRef.current = null;
    }
    setOauthStarting(false);
  }

  function applyLoaded(res) {
    setData(res);
    const initial = {};
    for (const c of res.credentials || []) {
      if (!c.is_secret && c.value) initial[c.field_key] = c.value;
    }
    if (service === 'pagarme' && !String(initial.api_base_url || '').trim()) {
      initial.api_base_url = PAGARME_DEFAULT_API_BASE;
    }
    setFields(initial);
    setEditing({});
    if (res.sc_status) {
      setAssocRecipientDraft(res.sc_status.association_recipient_id || '');
    }
    if (service === 'utalk') {
      const drafts = {};
      for (const a of res.attendants || []) {
        drafts[a.code] = a.utalk_id || '';
      }
      setUtalkIdDrafts(drafts);
      setTriageMessageDraft(
        res.triage_message ||
          'Olá {{nome}}, recebemos seu contato. Em breve um atendente falará com você.'
      );
    }
  }

  async function reload() {
    const res = await loadExternalService(api, service);
    applyLoaded(res);
    return res;
  }

  useEffect(() => () => stopOauthWait(), []);

  useEffect(() => {
    let cancelled = false;
    // Evita flash do serviço anterior (ex.: Pagar.me → Pedidos SouCannabis).
    setData(null);
    setFields({});
    setEditing({});
    clearFeedback();
    setFeedbackAt(null);
    setPagarmeForceEdit(false);
    setOutboundCreds(null);
    setWebhookInfo(null);
    setAssocRecipientDraft('');
    setCalendars([]);
    setUtalkIdDrafts({});
    setUtalkAttendantSaving(null);
    setTriageMessageDraft(
      'Olá {{nome}}, recebemos seu contato. Em breve um atendente falará com você.'
    );
    setTriageMessageSaving(false);
    setSaving(false);
    stopOauthWait();
    (async () => {
      try {
        const res = await loadExternalService(api, service);
        if (!cancelled) {
          applyLoaded(res);
          clearFeedback();
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          reportError('misc', err.message || 'Falha');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, service]);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;
    if (oauth === 'ok') {
      reportMsg(
        'auth',
        service === 'google_calendar'
          ? 'OAuth Google Calendar autorizado — tokens salvos'
          : 'OAuth Melhor Envio autorizado — tokens salvos'
      );
      reload().then(() => notifyExternalServicesChanged()).catch(() => {});
    } else if (oauth === 'error') {
      reportError(
        'auth',
        searchParams.get('message') ||
          (service === 'google_calendar' ? 'Falha no OAuth Google' : 'Falha no OAuth Melhor Envio')
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete('oauth');
    next.delete('message');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function onToggle(flag, value) {
    clearFeedback();
    if (
      FREIGHT_SERVICES.has(service) &&
      value === true &&
      (flag === 'enabled' || flag === 'use_for_quote' || flag === 'use_for_label') &&
      data?.store_freight_ready === false
    ) {
      const label = service === 'loggi' ? 'Loggi' : 'Melhor Envio';
      reportError(
        'flags',
        `Não é possível ativar o ${label}: preencha Dados de envio.`
      );
      return;
    }
    if (flag === 'enabled' && value === true) {
      const authed = isExternalServiceAuthenticated(data);
      const pagarmeTestPayment =
        data?.pagarme_status?.webhooks?.test_payment || data?.pagarme_status?.webhooks?.test_order;
      const canTurnOn =
        service === 'pagarme'
          ? Boolean(
              (data?.pagarme_status?.credentials_complete ||
                (data?.credentials || []).some((c) => c.field_key === 'secret_key' && c.has_value)) &&
                pagarmeTestPayment?.order?.id
            )
          : authed;
      if (!canTurnOn) {
        reportError(
          'flags',
          service === 'pagarme'
            ? 'Autentique a API e crie o link de pagamento de teste (passo 2) antes de ativar.'
            : 'Autentique o módulo antes de ativá-lo.'
        );
        return;
      }
    }
    const prev = data;
    setData((d) => (d ? { ...d, [flag]: value } : d));
    try {
      const res = await saveExternalServiceFlags(api, service, { [flag]: value });
      setData((d) =>
        d
          ? {
              ...d,
              use_for_quote: res.use_for_quote,
              use_for_label: res.use_for_label,
              use_for_tracking: res.use_for_tracking,
              sc_blocks_quote_label: res.sc_blocks_quote_label,
              use_for_validation: res.use_for_validation,
              use_for_scheduling: res.use_for_scheduling,
              primary_calendar_id: res.primary_calendar_id,
              config_enabled: res.config_enabled,
              enabled: res.enabled,
              source: res.source,
              env_default: res.env_default,
            }
          : d
      );
      notifyExternalServicesChanged();
    } catch (err) {
      setData(prev);
      reportError('flags', err.message || 'Falha ao salvar flag');
    }
  }

  async function finishOauthSuccess() {
    stopOauthWait();
    reportMsg('auth', 'Autenticado no Melhor Envio — tokens salvos');
    await reload();
    notifyExternalServicesChanged();
  }

  function finishOauthError(message) {
    stopOauthWait();
    reportError('auth', message || 'Falha no OAuth Melhor Envio');
  }

  async function openMelhorEnvioOAuth() {
    setOauthStarting(true);
    const url = await startMelhorEnvioOAuth(api);
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(
        `URL OAuth inválida (não é absoluta): ${url}. Confira PUBLIC_API_URL e as credenciais do Melhor Envio.`
      );
    }

    // Snapshot before opening: re-auth already has tokens — do not treat "authenticated"
    // as success until the access_token timestamp changes (or first-time auth completes).
    let baseline;
    try {
      baseline = await getMelhorEnvioOAuthStatus(api);
    } catch {
      baseline = { authenticated: false, access_token_updated_at: null };
    }

    function oauthCompleted(status) {
      if (!status?.authenticated) return false;
      if (!baseline?.authenticated) return true;
      const before = baseline.access_token_updated_at || null;
      const after = status.access_token_updated_at || null;
      return Boolean(after && after !== before);
    }

    const popup = window.open(url, 'melhorenvio_oauth', 'popup=yes,width=720,height=800');
    if (!popup) {
      throw new Error('Pop-up bloqueado — permita pop-ups para este site e tente de novo');
    }
    reportMsg('misc',
      baseline?.authenticated
        ? 'Reautorização — conclua o login no Melhor Envio na nova janela…'
        : 'Teste ok — autorize na nova aba…'
    );

    const onMessage = (event) => {
      const dataMsg = event.data;
      if (!dataMsg || dataMsg.type !== 'melhorenvio-oauth') return;
      if (dataMsg.ok) finishOauthSuccess();
      else finishOauthError(dataMsg.message);
    };
    window.addEventListener('message', onMessage);

    const interval = setInterval(async () => {
      try {
        if (popup.closed) {
          const status = await getMelhorEnvioOAuthStatus(api);
          if (oauthCompleted(status)) await finishOauthSuccess();
          else finishOauthError('Janela OAuth fechada antes de concluir');
          return;
        }
        const status = await getMelhorEnvioOAuthStatus(api);
        if (oauthCompleted(status)) {
          try {
            popup.close();
          } catch {
            /* ignore */
          }
          await finishOauthSuccess();
        }
      } catch {
        /* keep waiting */
      }
    }, 2000);

    const timeout = setTimeout(() => {
      finishOauthError('Tempo esgotado aguardando autorização Melhor Envio');
    }, 5 * 60 * 1000);

    oauthWaitRef.current = { interval, timeout, onMessage };
  }

  async function openGoogleCalendarOAuth() {
    setOauthStarting(true);
    const url = await startGoogleCalendarOAuth(api);
    const popup = window.open(url, 'google_calendar_oauth', 'popup=yes,width=720,height=800');
    if (!popup) {
      throw new Error('Pop-up bloqueado — permita pop-ups para este site e tente de novo');
    }
    reportMsg('misc', 'Autorize o Google Calendar na nova janela…');

    const onMessage = (event) => {
      const dataMsg = event.data;
      if (!dataMsg || dataMsg.type !== 'google-calendar-oauth') return;
      if (dataMsg.ok) {
        stopOauthWait();
        reportMsg('misc', 'Autenticado no Google Calendar — tokens salvos');
        reload().then(loadCalendars).catch(() => {});
      } else {
        stopOauthWait();
        reportError('misc', dataMsg.message || 'Falha no OAuth Google');
      }
    };
    window.addEventListener('message', onMessage);

    const interval = setInterval(async () => {
      try {
        if (popup.closed) {
          const status = await getGoogleCalendarOAuthStatus(api);
          if (status?.connected || status?.has_refresh_token) {
            stopOauthWait();
            reportMsg('misc', 'Autenticado no Google Calendar — tokens salvos');
            await reload();
            await loadCalendars();
          } else {
            stopOauthWait();
            reportError('misc', 'Janela OAuth fechada antes de concluir');
          }
        }
      } catch {
        /* keep waiting */
      }
    }, 2000);

    const timeout = setTimeout(() => {
      stopOauthWait();
      reportError('misc', 'Tempo esgotado aguardando autorização Google');
    }, 5 * 60 * 1000);

    oauthWaitRef.current = { interval, timeout, onMessage };
  }

  async function loadCalendars() {
    if (service !== 'google_calendar') return;
    try {
      const res = await api.listGoogleCalendars();
      setCalendars(res.data || []);
    } catch {
      setCalendars([]);
    }
  }

  useEffect(() => {
    if (service === 'google_calendar' && data?.oauth?.authenticated) {
      loadCalendars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, data?.oauth?.authenticated]);

  async function onAuthenticate(e) {
    e.preventDefault();
    setSaving(true);
    clearFeedback();
    try {
      if (service === 'utalk') {
        const fromPhone =
          (fields.from_phone && String(fields.from_phone).trim()) ||
          (data?.credentials || []).find((c) => c.field_key === 'from_phone' && c.has_value)?.value ||
          '';
        if (!/^\+55\d{10,11}$/.test(String(fromPhone).trim())) {
          throw new Error(
            'Informe o telefone do canal no formato +55 e número completo (ex.: +5562999999999) antes de autenticar'
          );
        }
      }

      const formCreds =
        service === 'google_calendar' &&
        !(data?.credentials || []).some((c) => c.field_key === 'client_id')
          ? GOOGLE_CALENDAR_FORM_CREDS
          : service === 'email' && !(data?.credentials || []).length
            ? EMAIL_FORM_CREDS
            : data?.credentials || [];

      const payload = {};
      for (const c of formCreds) {
        const hideOauthMeta =
          service === 'melhorenvio' || service === 'google_calendar'
            ? HIDDEN_CRED_FIELDS.has(c.field_key)
            : ['access_token', 'refresh_token', 'environment', 'redirect_uri'].includes(c.field_key);
        if (hideOauthMeta) continue;
        // Pagar.me: Autenticar só envia secret/public; webhooks têm bloco próprio.
        if (service === 'pagarme' && PAGARME_WEBHOOK_FIELDS.has(c.field_key)) continue;
        if (service === 'pagarme' && !PAGARME_AUTH_FIELDS.has(c.field_key)) continue;
        const v = fields[c.field_key];
        if (v === undefined || v === '') continue;
        if (editing[c.field_key] || !c.has_value || service === 'email') {
          payload[c.field_key] = v;
        }
      }

      // Google: include newly typed secrets (secrets não voltam no GET).
      if (service === 'google_calendar') {
        for (const key of ['client_id', 'client_secret']) {
          const v = fields[key];
          if (v !== undefined && v !== '') payload[key] = v;
        }
      }

      // Pagar.me: secret/public/api_base tipados entram mesmo sem clicar “editar” no estado.
      if (service === 'pagarme') {
        for (const key of ['secret_key', 'public_key', 'api_base_url']) {
          const v = fields[key];
          if (v !== undefined && v !== '') payload[key] = v;
        }
        if (!String(payload.api_base_url || '').trim()) {
          payload.api_base_url = PAGARME_DEFAULT_API_BASE;
        }
      }

      // Pedidos SouCannabis: tipados entram mesmo sem “editar”.
      if (service === 'soucannabis_orders') {
        for (const key of SC_AUTH_FIELDS) {
          const v = fields[key];
          if (v !== undefined && v !== '') payload[key] = v;
        }
      }

      // Utalk: from_phone tipado entra mesmo sem “editar”.
      if (service === 'utalk') {
        for (const key of ['api_token', 'organization_id', 'from_phone', 'api_base_url']) {
          const v = fields[key];
          if (v !== undefined && v !== '') payload[key] = v;
        }
      }

      // E-mail: senha pode estar vazia no estado se não reeditada — só manda se preenchida.
      if (service === 'email' && fields.pass) {
        payload.pass = fields.pass;
      }

      const hasPayload = Object.keys(payload).length > 0;
      if (hasPayload) {
        await saveExternalCredentials(api, service, payload, true);
      } else if (service === 'google_calendar') {
        const byKey = Object.fromEntries(
          (data?.credentials || []).map((c) => [c.field_key, c])
        );
        const hasSaved =
          Boolean(byKey.client_id?.has_value) && Boolean(byKey.client_secret?.has_value);
        if (!hasSaved) {
          throw new Error('Preencha Client ID e Client Secret antes de autenticar');
        }
        // Credenciais já salvas — só revalida e segue para OAuth.
        await testExternalService(api, service);
      } else {
        await testExternalService(api, service);
      }

      await reload();
      notifyExternalServicesChanged();

      if (service === 'melhorenvio') {
        await openMelhorEnvioOAuth();
      } else if (service === 'google_calendar') {
        await openGoogleCalendarOAuth();
      } else if (service === 'email') {
        reportMsg('auth', 'Credenciais autenticadas e módulo ativado');
      } else {
        reportMsg('auth', 'Credenciais autenticadas (teste ok)');
      }
    } catch (err) {
      stopOauthWait();
      reportError('auth', formatExternalAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSendTestEmail(e) {
    e.preventDefault();
    setSendingTestEmail(true);
    clearFeedback();
    try {
      await sendExternalTestEmail(api, testEmailTo);
      reportMsg('email-test', `E-mail de teste enviado para ${testEmailTo}`);
    } catch (err) {
      reportError('email-test', err.message || 'Falha ao enviar e-mail de teste');
    } finally {
      setSendingTestEmail(false);
    }
  }

  if (!data && !error) {
    return <AdminLoader data-testid="ext-loading" />;
  }
  if (!data) {
    return (
      <div className="ext-page">
        <div className="admin-top">
          <div>
            <h1 style={{ margin: 0 }}>{SERVICE_LABELS[service] || service}</h1>
          </div>
        </div>
        <div className="card ext-card">
          <p className="alert alert-error" role="alert" data-testid="ext-error">
            {error}
          </p>
        </div>
      </div>
    );
  }

  const moduleStatus = deriveExternalServiceStatus(data);
  const pinnedApiBase =
    data.me_urls?.production?.api_base_url || ME_DEFAULT_URLS.production;
  const credList =
    service === 'google_calendar' &&
    !(data.credentials || []).some((c) => c.field_key === 'client_id')
      ? GOOGLE_CALENDAR_FORM_CREDS
      : service === 'email' && !(data.credentials || []).length
        ? EMAIL_FORM_CREDS
        : data.credentials || [];
  const UTALK_CRED_ORDER = ['api_token', 'organization_id', 'from_phone', 'api_base_url'];
  const PAGARME_AUTH_ORDER = ['secret_key', 'public_key', 'api_base_url'];
  const editableCreds = credList
    .filter((c) => {
      if (service === 'melhorenvio' || service === 'google_calendar') {
        if (HIDDEN_CRED_FIELDS.has(c.field_key)) return false;
      } else if (['access_token', 'refresh_token', 'environment', 'redirect_uri'].includes(c.field_key)) {
        return false;
      }
      if (service === 'pagarme' && PAGARME_WEBHOOK_FIELDS.has(c.field_key)) return false;
      if (service === 'pagarme' && !PAGARME_AUTH_FIELDS.has(c.field_key)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (service === 'utalk') {
        const ia = UTALK_CRED_ORDER.indexOf(a.field_key);
        const ib = UTALK_CRED_ORDER.indexOf(b.field_key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }
      if (service === 'pagarme') {
        const ia = PAGARME_AUTH_ORDER.indexOf(a.field_key);
        const ib = PAGARME_AUTH_ORDER.indexOf(b.field_key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }
      return 0;
    });
  const pagarmeWebhookCreds = credList.filter((c) => PAGARME_WEBHOOK_FIELDS.has(c.field_key));
  const oauth = data.oauth;
  const busy = saving || oauthStarting;
  const pagarmeAuthed = Boolean(
    data.pagarme_status?.credentials_complete ||
      (data.credentials || []).some((c) => c.field_key === 'secret_key' && c.has_value)
  );
  const pagarmeWebhooksReady = Boolean(data.pagarme_status?.webhooks?.ready);
  const pagarmeWebhookAuthReady = Boolean(
    data.pagarme_status?.webhooks?.basic_auth_configured ||
      ((data.credentials || []).some((c) => c.field_key === 'webhook_user' && c.has_value) &&
        (data.credentials || []).some((c) => c.field_key === 'webhook_pass' && c.has_value)) ||
      (String(fields.webhook_user || '').trim() && String(fields.webhook_pass || '').trim())
  );
  const pagarmeTestPayment =
    data.pagarme_status?.webhooks?.test_payment || data.pagarme_status?.webhooks?.test_order || null;
  const pagarmePaymentLinkReady = Boolean(pagarmeTestPayment?.order?.id);
  const pagarmeCanEnable = pagarmeAuthed && pagarmePaymentLinkReady;
  const moduleAuthenticated = isExternalServiceAuthenticated(data);
  const canTurnModuleOn = service === 'pagarme' ? pagarmeCanEnable : moduleAuthenticated;
  const pagarmeSetupComplete =
    pagarmeAuthed && pagarmePaymentLinkReady && pagarmeWebhooksReady;
  const pagarmeShowSetup = !pagarmeSetupComplete || pagarmeForceEdit;
  const pagarmeSetupBlockStyle = {
    marginTop: 16,
    padding: '1.1rem 1.15rem',
    border: '1px solid var(--admin-border)',
    borderRadius: 10,
    background: '#151a16',
  };
  const pagarmeConnectedRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #2e5a3a',
    background: '#1a2a1c',
    color: '#7dcea0',
    fontWeight: 600,
  };

  const freightActivationBlocked =
    FREIGHT_SERVICES.has(service) && data.store_freight_ready === false;

  return (
    <div className="ext-page ext-page-wide">
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>{SERVICE_LABELS[service] || service}</h1>
        </div>
      </div>

      <div className="card ext-card">
        <ExternalServiceStatusBanner status={moduleStatus} />

        <section className="ext-section">
          <h2 className="ext-section-title">Módulo</h2>
          <div className="ext-flag-tree" data-testid="module-flag-tree">
            <label
              className={`ext-flag${data.enabled ? ' ext-flag--active' : ''}`}
              data-testid="module-enabled-toggle"
            >
              <input
                type="checkbox"
                checked={Boolean(data.enabled)}
                disabled={
                  (!data.enabled && !canTurnModuleOn) ||
                  (freightActivationBlocked && !data.enabled)
                }
                onChange={(e) => onToggle('enabled', e.target.checked)}
              />
              <span className="ext-flag-body">
                <strong>Módulo ativo</strong>
                <span className="muted">
                  {service === 'pagarme'
                    ? 'Ativa automaticamente após autenticar a API e criar o link de teste (passo 2).'
                    : FREIGHT_SERVICES.has(service)
                      ? 'Requer autenticação e Dados de envio completos.'
                      : 'Só pode ativar depois de autenticar o serviço. Desligar permanece permitido.'}
                </span>
                <span className="muted" data-testid="module-enabled-status">
                  Estado: {data.enabled ? 'habilitado' : 'desabilitado'}
                </span>
                {!data.enabled && !canTurnModuleOn ? (
                  <span className="muted" style={{ color: 'var(--admin-danger)' }} data-testid="module-enable-auth-hint">
                    {service === 'pagarme'
                      ? !pagarmeAuthed
                        ? 'Autentique a Secret key (passo 1).'
                        : 'Crie um link de pagamento de teste (passo 2).'
                      : 'Autentique o serviço abaixo antes de ativar o módulo.'}
                  </span>
                ) : null}
                {freightActivationBlocked && !data.enabled ? (
                  <span className="muted" style={{ color: 'var(--admin-danger)' }}>
                    Complete Dados de envio para ativar o módulo.
                  </span>
                ) : null}
              </span>
            </label>

            {FREIGHT_SERVICES.has(service) ||
            service === 'geoapify' ||
            service === 'pagarme' ||
            service === 'soucannabis_orders' ||
            service === 'google_calendar' ? (
              <div
                className="ext-flag-tree-children"
                data-testid="module-usage-flags"
                data-locked={data.enabled ? 'false' : 'true'}
              >
                {!data.enabled ? (
                  <p className="muted ext-flag-tree-hint" data-testid="module-usage-locked-hint">
                    Ative o módulo acima para configurar os usos.
                  </p>
                ) : null}

                {FREIGHT_SERVICES.has(service) ? (
                  <>
                    {data.sc_blocks_quote_label ? (
                      <div className="alert ext-status-banner--warning" role="status">
                        Pedidos SouCannabis ativo: cotação e etiqueta ficam desligadas. Use só{' '}
                        <strong>Tracking</strong> para consultar status.
                      </div>
                    ) : null}
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_quote ? ' ext-flag--active' : ''}`}
                      style={{
                        opacity:
                          !data.enabled ||
                          data.sc_blocks_quote_label ||
                          (freightActivationBlocked && !data.use_for_quote)
                            ? 0.5
                            : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-quote"
                        checked={Boolean(data.use_for_quote)}
                        disabled={
                          !data.enabled ||
                          Boolean(data.sc_blocks_quote_label) ||
                          (freightActivationBlocked && !data.use_for_quote)
                        }
                        onChange={(e) => onToggle('use_for_quote', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Usar na cotação</strong>
                      </span>
                    </label>
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_label ? ' ext-flag--active' : ''}`}
                      style={{
                        opacity:
                          !data.enabled ||
                          data.sc_blocks_quote_label ||
                          (freightActivationBlocked && !data.use_for_label)
                            ? 0.5
                            : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-label"
                        checked={Boolean(data.use_for_label)}
                        disabled={
                          !data.enabled ||
                          Boolean(data.sc_blocks_quote_label) ||
                          (freightActivationBlocked && !data.use_for_label)
                        }
                        onChange={(e) => onToggle('use_for_label', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Usar na etiqueta</strong>
                      </span>
                    </label>
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_tracking ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-tracking"
                        checked={Boolean(data.use_for_tracking)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('use_for_tracking', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Tracking (código de rastreio)</strong>
                      </span>
                    </label>
                  </>
                ) : null}

                {service === 'geoapify' ? (
                  <label
                    className={`ext-flag ext-flag--child${data.use_for_validation ? ' ext-flag--active' : ''}`}
                    style={{ opacity: data.enabled ? 1 : 0.5 }}
                  >
                    <input
                      type="checkbox"
                      data-testid="use-for-validation"
                      checked={Boolean(data.use_for_validation)}
                      disabled={!data.enabled}
                      onChange={(e) => onToggle('use_for_validation', e.target.checked)}
                    />
                    <span className="ext-flag-body">
                      <strong>Usar na verificação de endereço</strong>
                    </span>
                  </label>
                ) : null}

                {service === 'pagarme' ? (
                  <>
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_orders ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-orders"
                        checked={Boolean(data.use_for_orders)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('use_for_orders', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Usar em pedidos</strong>
                      </span>
                    </label>
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_services ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-services"
                        checked={Boolean(data.use_for_services)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('use_for_services', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Usar em serviços</strong>
                      </span>
                    </label>
                  </>
                ) : null}

                {service === 'soucannabis_orders' ? (
                  <>
                    <label
                      className={`ext-flag ext-flag--child${data.sync_products ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="sync-products"
                        checked={Boolean(data.sync_products)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('sync_products', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Sync produtos</strong>
                      </span>
                    </label>
                    <label
                      className={`ext-flag ext-flag--child${data.sync_tags ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="sync-tags"
                        checked={Boolean(data.sync_tags)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('sync_tags', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Sync tags</strong>
                      </span>
                    </label>
                    <label
                      className={`ext-flag ext-flag--child${data.sync_orders ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="sync-orders"
                        checked={Boolean(data.sync_orders)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('sync_orders', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Sync pedidos</strong>
                      </span>
                    </label>
                  </>
                ) : null}

                {service === 'google_calendar' ? (
                  <>
                    <label
                      className={`ext-flag ext-flag--child${data.use_for_scheduling ? ' ext-flag--active' : ''}`}
                      style={{ opacity: data.enabled ? 1 : 0.5 }}
                    >
                      <input
                        type="checkbox"
                        data-testid="use-for-scheduling"
                        checked={Boolean(data.use_for_scheduling)}
                        disabled={!data.enabled}
                        onChange={(e) => onToggle('use_for_scheduling', e.target.checked)}
                      />
                      <span className="ext-flag-body">
                        <strong>Usar no agendamento de serviços</strong>
                      </span>
                    </label>
                    <div className="field" style={{ marginTop: 4 }}>
                      <label htmlFor="primary-calendar">Calendário principal da associação</label>
                      <select
                        id="primary-calendar"
                        className="input"
                        data-testid="primary-calendar"
                        value={data.primary_calendar_id || ''}
                        disabled={!data.enabled || !calendars.length}
                        onChange={(e) => onToggle('primary_calendar_id', e.target.value || null)}
                      >
                        <option value="">— selecione após autorizar —</option>
                        {calendars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.summary}
                            {c.primary ? ' (primary Google)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="muted" style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                        Eventos de consulta vão nos calendários secundários de cada profissional, não
                        neste.
                      </p>
                    </div>
                    {oauth ? (
                      <p className="muted" style={{ margin: 0 }}>
                        OAuth:{' '}
                        <strong>{oauth.authenticated ? 'autorizado' : 'não autorizado'}</strong>
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <ExtActionFeedback at="flags" feedbackAt={feedbackAt} error={error} msg={msg} />
        </section>

      <CredentialsSetupGuide service={service} />

      {service === 'melhorenvio' && data.store_freight_ready === false && (
        <div
          role="alert"
          data-testid="freight-gate"
          style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 8,
            color: '#000',
          }}
        >
          <strong>Dados de envio incompletos.</strong> Você pode autenticar agora, mas só poderá
          ativar o módulo (e cotação/etiqueta) depois de preencher remetente, caixa e declaração em{' '}
          <Link to="/servicos-externos/envio">Dados de envio</Link>.
        </div>
      )}

      {service === 'pagarme' && pagarmeSetupComplete && !pagarmeForceEdit && (
        <div
          data-testid="pagarme-connected-summary"
          style={{ ...pagarmeSetupBlockStyle, borderColor: '#2e5a3a' }}
        >
          <p style={{ margin: '0 0 12px', color: '#7dcea0', fontWeight: 700, fontSize: '1.05rem' }}>
            Pagar.me conectado
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <div data-testid="pagarme-connected-auth" style={pagarmeConnectedRowStyle}>
              <span>1. API autenticada</span>
              <span>conectado</span>
            </div>
            <div data-testid="pagarme-connected-payment" style={pagarmeConnectedRowStyle}>
              <span>2. Link de pagamento</span>
              <span>conectado</span>
            </div>
            <div data-testid="pagarme-connected-webhooks" style={pagarmeConnectedRowStyle}>
              <span>3. Webhooks (HTTP Basic no Pagar.me)</span>
              <span>conectado</span>
            </div>
          </div>
          <button
            type="button"
            className="btn"
            data-testid="pagarme-reconfigure"
            style={{ marginTop: 14 }}
            onClick={() => setPagarmeForceEdit(true)}
          >
            Reconfigurar
          </button>
        </div>
      )}

      {service === 'pagarme' && pagarmeShowSetup && (
        <div
          data-testid="pagarme-step-auth"
          style={pagarmeSetupBlockStyle}
        >
          <h3 style={{ marginTop: 0 }}>1. Autenticar API</h3>
          {pagarmeAuthed ? (
            <p
              data-testid="pagarme-auth-ok"
              style={{ color: '#7dcea0', margin: '0 0 12px', fontWeight: 600 }}
            >
              Autenticado
              {data.pagarme_status?.is_psp === true
                ? ' · conta PSP'
                : data.pagarme_status?.is_psp === false
                  ? ' · conta Gateway (sem split)'
                  : ''}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Salve e teste a <strong>Secret key</strong> (<code>sk_test_…</code>). Public key é
              opcional. O passo 2 abre depois da autenticação.
            </p>
          )}
          <form onSubmit={onAuthenticate} autoComplete="off">
            <div className="ext-form-grid">
              {editableCreds.map((c) => (
                <CredentialField
                  key={c.field_key}
                  cred={c}
                  value={fields[c.field_key]}
                  editing={Boolean(editing[c.field_key])}
                  alwaysEditable={c.field_key === 'api_base_url'}
                  serviceName={service}
                  onChange={(v) => setFields((prev) => ({ ...prev, [c.field_key]: v }))}
                  onStartEdit={() => {
                    setEditing((prev) => ({ ...prev, [c.field_key]: true }));
                    setFields((prev) => ({
                      ...prev,
                      [c.field_key]: c.is_secret ? '' : c.value || prev[c.field_key] || '',
                    }));
                  }}
                  onCancelEdit={() => {
                    setEditing((prev) => {
                      const next = { ...prev };
                      delete next[c.field_key];
                      return next;
                    });
                    setFields((prev) => {
                      const next = { ...prev };
                      if (c.is_secret) delete next[c.field_key];
                      else if (c.value) next[c.field_key] = c.value;
                      else if (c.field_key === 'api_base_url') {
                        next.api_base_url = PAGARME_DEFAULT_API_BASE;
                      }
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            <div className="ext-action-row" style={{ marginTop: 14 }}>
              <AuthenticateButton
                busy={busy}
                label={pagarmeAuthed ? 'Reautenticar' : 'Autenticar'}
              />
              {pagarmeSetupComplete && (
                <button
                  type="button"
                  className="btn"
                  data-testid="pagarme-close-setup"
                  onClick={() => setPagarmeForceEdit(false)}
                >
                  Fechar
                </button>
              )}
            </div>
            <ExtActionFeedback at="auth" feedbackAt={feedbackAt} error={error} msg={msg} />
            <p className="muted" data-testid="pagarme-auth-hint" style={{ marginTop: 10 }}>
              Autenticar salva secret/public/URL e testa a API (lista recipients → indica se a conta é
              PSP). Contas Gateway só suportam Pagar.me standalone, sem split SouCannabis.
            </p>
          </form>
        </div>
      )}

      {service !== 'pagarme' && (
        <>
          <h3>Credenciais de conexão</h3>
          <form onSubmit={onAuthenticate} autoComplete="off">
            <div className="ext-form-grid">
              {service === 'melhorenvio' && (
                <div className="field field--wide">
                  <label>API base URL</label>
                  <div className="cred-value-row" data-testid="cred-display-api_base_url">
                    <span className="cred-value-text">{pinnedApiBase}</span>
                  </div>
                </div>
              )}

              {(service === 'melhorenvio' || service === 'google_calendar') && (
                <OAuthRedirectUriCopy uri={data.oauth_redirect_uri} />
              )}

              {editableCreds.map((c) => (
                <CredentialField
                  key={c.field_key}
                  cred={c}
                  value={fields[c.field_key]}
                  editing={Boolean(editing[c.field_key])}
                  alwaysEditable={service === 'email'}
                  serviceName={service}
                  onChange={(v) => setFields((prev) => ({ ...prev, [c.field_key]: v }))}
                  onStartEdit={() => {
                    setEditing((prev) => ({ ...prev, [c.field_key]: true }));
                    setFields((prev) => ({
                      ...prev,
                      [c.field_key]: c.is_secret ? '' : c.value || prev[c.field_key] || '',
                    }));
                  }}
                  onCancelEdit={() => {
                    setEditing((prev) => {
                      const next = { ...prev };
                      delete next[c.field_key];
                      return next;
                    });
                    setFields((prev) => {
                      const next = { ...prev };
                      if (c.is_secret) delete next[c.field_key];
                      else if (c.value) next[c.field_key] = c.value;
                      return next;
                    });
                  }}
                />
              ))}
            </div>

            {service === 'loggi' ? (
              <>
                <div className="ext-action-row ext-action-row--below-form">
                  <AuthenticateButton busy={busy} />
                </div>
                <ExtActionFeedback at="auth" feedbackAt={feedbackAt} error={error} msg={msg} />
              </>
            ) : (
              <>
                <div className="ext-action-row" style={{ marginTop: 14 }}>
                  <AuthenticateButton busy={busy} />
                </div>
                <ExtActionFeedback at="auth" feedbackAt={feedbackAt} error={error} msg={msg} />
                {service === 'melhorenvio' && (
                  <p className="muted me-oauth-hint">
                    Autenticar testa as credenciais e, se ok, abre o Melhor Envio para autorizar o app.
                  </p>
                )}
                {service === 'google_calendar' && (
                  <p className="muted" data-testid="gc-oauth-hint">
                    Autenticar salva Client ID/Secret, grava a Redirect URI automaticamente, testa e abre o
                    Google para autorizar a conta da associação (tokens ficam só no servidor).
                  </p>
                )}
                {service === 'email' && (
                  <p className="muted" data-testid="email-smtp-hint">
                    Autenticar valida a conexão SMTP (VERIFY) e ativa o módulo automaticamente. Depois
                    use o campo abaixo para enviar um e-mail de teste.
                  </p>
                )}
                {service === 'soucannabis_orders' && (
                  <p className="muted" data-testid="sc-auth-hint">
                    Autenticar obtém token OAuth, valida /me (payment_percentage inteiro) e testa products/tags.
                    Exige Pagar.me ativo e conta PSP.
                  </p>
                )}
              </>
            )}
          </form>
        </>
      )}

      {/* feedback legado removido — usa ExtActionFeedback por ação */}

      {service === 'pagarme' && pagarmeShowSetup && pagarmeAuthed && (
        <section
          data-testid="pagarme-test-payment"
          style={pagarmeSetupBlockStyle}
        >
          <h3 style={{ marginTop: 0 }}>2. Link de pagamento de teste</h3>
          {pagarmePaymentLinkReady && pagarmeTestPayment ? (
            <div
              data-testid="pagarme-test-payment-result"
              style={{
                margin: '0 0 14px',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--admin-border)',
                background: '#1a2a1c',
              }}
            >
              <p style={{ margin: '0 0 6px', color: '#7dcea0', fontWeight: 600 }}>
                Link de pagamento criado
              </p>
              <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--admin-muted)' }}>
                Link <code>{pagarmeTestPayment.order.id}</code>
                {' · '}
                code <code>{pagarmeTestPayment.code}</code>
                {' · '}
                status {pagarmeTestPayment.order.status}
              </p>
              {pagarmeTestPayment.payment_url ? (
                <>
                  <CopyableUrlRow
                    label="Link de pagamento"
                    url={pagarmeTestPayment.payment_url}
                    testId="pagarme-payment-link"
                  />
                  <a
                    href={pagarmeTestPayment.payment_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="pagarme-payment-link-open"
                    style={{ fontSize: '0.85rem' }}
                  >
                    Abrir link de pagamento
                  </a>
                </>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Pedido criado, mas a Pagar.me não retornou URL de checkout.
                </p>
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="btn"
            data-testid="pagarme-create-test-payment"
            disabled={busy}
            onClick={async () => {
              setSaving(true);
              clearFeedback();
              try {
                const res = await api.createPagarmeTestPaymentLink();
                const tp = res.data;
                setPagarmeForceEdit(true);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        enabled: true,
                        pagarme_status: {
                          ...(prev.pagarme_status || {}),
                          webhooks: {
                            ...(prev.pagarme_status?.webhooks || {}),
                            test_payment: tp,
                            test_order: tp,
                            ready: false,
                          },
                        },
                      }
                    : prev
                );
                reportMsg(
                  'misc',
                  tp?.payment_url
                    ? 'Link criado — módulo ativado. Configure os webhooks no passo 3 quando quiser.'
                    : `Link ${tp?.order?.id || tp?.code} criado — módulo ativado.`
                );
                await reload();
              } catch (err) {
                reportError('misc', err.message || 'Falha ao criar link de pagamento');
              } finally {
                setSaving(false);
              }
            }}
          >
            {busy
              ? 'Criando link…'
              : pagarmePaymentLinkReady
                ? 'Criar novo link de pagamento'
                : 'Criar link de pagamento'}
          </button>
        </section>
      )}

      {service === 'pagarme' && pagarmeShowSetup && pagarmeAuthed && pagarmePaymentLinkReady && (
        <section
          data-testid="pagarme-webhooks"
          style={pagarmeSetupBlockStyle}
        >
          <h3 style={{ marginTop: 0 }}>3. Webhooks — autenticação obrigatória no Pagar.me</h3>
          <p
            data-testid="pagarme-webhooks-dashboard-hint"
            style={{
              fontSize: '0.85rem',
              margin: '0 0 14px',
              padding: '8px 10px',
              background: '#f4f6f4',
              borderRadius: 6,
              color: '#000',
            }}
          >
            {data.pagarme_status?.webhooks?.dashboard_hint || (
              <>
                <strong>Obrigatório:</strong> no painel da Pagar.me o webhook precisa de
                autenticação <strong>HTTP Basic</strong> (usuário e senha iguais aos desta tela).
                Sem isso a API responde 401 e o pagamento não é confirmado. Conta → Configurações →
                Webhooks → Criar webhook; cole as URLs abaixo; ative HTTP Basic — não deixe o
                webhook anônimo. Eventos: <code>order.created</code> (obrigatório) e{' '}
                <code>order.paid</code>. Depois abra o link do passo 2, gere o boleto sem pagá-lo e
                clique em Validar (o <code>order.created</code> pode levar até 1 minuto).
              </>
            )}
          </p>
          {!pagarmeWebhookAuthReady && (
            <p
              data-testid="pagarme-webhooks-auth-required"
              style={{
                fontSize: '0.85rem',
                margin: '0 0 14px',
                padding: '8px 10px',
                background: '#f8e8e8',
                borderRadius: 6,
                color: '#000',
              }}
            >
              Salve usuário e senha abaixo e cadastre os <strong>mesmos valores</strong> no webhook
              da Pagar.me. A API rejeita qualquer POST sem Basic Auth.
            </p>
          )}

          <div style={{ marginBottom: 16 }}>
            <CopyableUrlRow
              label="Pedidos"
              url={data.webhook_urls?.orders}
              testId="webhook-orders"
            />
            <CopyableUrlRow
              label="Serviços"
              url={data.webhook_urls?.services}
              testId="webhook-services"
            />
          </div>

          <div
            data-testid="pagarme-webhooks-status"
            style={{ marginBottom: 14, fontSize: '0.85rem', color: 'var(--admin-text)' }}
          >
            <p style={{ margin: '0 0 6px' }}>
              Webhooks válidos:{' '}
              {pagarmeWebhooksReady ? (
                <span style={{ color: '#7dcea0' }}>sim</span>
              ) : (
                <span style={{ color: 'var(--admin-danger)' }}>não</span>
              )}
              {data.pagarme_status?.webhooks?.validated_at
                ? ` · última tentativa ${data.pagarme_status.webhooks.validated_at}`
                : ''}
            </p>
            {data.pagarme_status?.webhooks?.details && (
              <p style={{ margin: '0 0 6px', color: 'var(--admin-muted)' }}>
                Endpoints:{' '}
                {data.pagarme_status.webhooks.details.public_ok
                  ? 'OK'
                  : data.pagarme_status.webhooks.details.public_ok == null
                    ? '—'
                    : 'falhou'}
                {' · '}
                order.created:{' '}
                {data.pagarme_status.webhooks.details.order_created_event ? (
                  <span style={{ color: '#7dcea0' }}>recebido pela API</span>
                ) : (
                  <span style={{ color: 'var(--admin-danger)' }}>ainda não</span>
                )}
              </p>
            )}
            {data.pagarme_status?.webhooks?.webhook_receipt && (
              <p
                style={{
                  margin: '0 0 6px',
                  color:
                    data.pagarme_status.webhooks.webhook_receipt.type === 'order.created' &&
                    data.pagarme_status.webhooks.webhook_receipt.auth_ok !== false
                      ? '#7dcea0'
                      : 'var(--admin-warn)',
                }}
              >
                Webhook recebido:{' '}
                <code>{data.pagarme_status.webhooks.webhook_receipt.type || 'evento'}</code>
                {' · code '}
                <code>{data.pagarme_status.webhooks.webhook_receipt.code}</code>
                {data.pagarme_status.webhooks.webhook_receipt.auth_ok === false
                  ? ' · Basic Auth falhou'
                  : ''}
                {' · '}
                {data.pagarme_status.webhooks.webhook_receipt.at}
              </p>
            )}
            {data.pagarme_status?.webhooks?.reason && !pagarmeWebhooksReady && (
              <p style={{ margin: '0 0 8px', color: 'var(--admin-danger)', whiteSpace: 'pre-wrap' }}>
                {data.pagarme_status.webhooks.reason}
              </p>
            )}
          </div>

          <form
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              clearFeedback();
              try {
                const payload = {};
                for (const key of ['webhook_user', 'webhook_pass']) {
                  const cred = pagarmeWebhookCreds.find((c) => c.field_key === key);
                  const typed = String(fields[key] || '').trim();
                  if (typed) payload[key] = typed;
                  else if (!cred?.has_value) {
                    throw new Error('Usuário e senha do webhook são obrigatórios');
                  }
                }
                if (!payload.webhook_user && !payload.webhook_pass) {
                  const hasUser = pagarmeWebhookCreds.some(
                    (c) => c.field_key === 'webhook_user' && c.has_value
                  );
                  const hasPass = pagarmeWebhookCreds.some(
                    (c) => c.field_key === 'webhook_pass' && c.has_value
                  );
                  if (!hasUser || !hasPass) {
                    throw new Error('Usuário e senha do webhook são obrigatórios');
                  }
                }
                if (Object.keys(payload).length) {
                  await saveExternalCredentials(api, 'pagarme', payload, false);
                }
                reportMsg('misc', 'Usuário e senha do webhook salvos — valide os webhooks');
                await reload();
              } catch (err) {
                reportError('misc', err.message || 'Falha ao salvar webhooks');
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="ext-form-grid">
              {pagarmeWebhookCreds.map((c) => (
                <CredentialField
                  key={c.field_key}
                  cred={c}
                  value={fields[c.field_key]}
                  editing={Boolean(editing[c.field_key])}
                  alwaysEditable={false}
                  serviceName={service}
                  onChange={(v) => setFields((prev) => ({ ...prev, [c.field_key]: v }))}
                  onStartEdit={() => {
                    setEditing((prev) => ({ ...prev, [c.field_key]: true }));
                    setFields((prev) => ({
                      ...prev,
                      [c.field_key]: c.is_secret ? '' : c.value || prev[c.field_key] || '',
                    }));
                  }}
                  onCancelEdit={() => {
                    setEditing((prev) => {
                      const next = { ...prev };
                      delete next[c.field_key];
                      return next;
                    });
                    setFields((prev) => {
                      const next = { ...prev };
                      if (c.is_secret) delete next[c.field_key];
                      else if (c.value) next[c.field_key] = c.value;
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            <div className="ext-action-row" style={{ marginTop: 14 }}>
              <button
                type="submit"
                className="btn"
                data-testid="save-pagarme-webhooks"
                disabled={busy}
              >
                {busy ? 'Salvando…' : 'Salvar usuário e senha'}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="validate-pagarme-webhooks"
                disabled={busy || !pagarmeWebhookAuthReady}
                onClick={async () => {
                  if (!pagarmeWebhookAuthReady) {
                    reportError('misc', 'Informe e salve usuário e senha do webhook antes de validar');
                    return;
                  }
                  setSaving(true);
                  clearFeedback();
                  try {
                    const payload = {};
                    for (const key of ['webhook_user', 'webhook_pass']) {
                      const typed = String(fields[key] || '').trim();
                      if (typed) payload[key] = typed;
                    }
                    if (Object.keys(payload).length) {
                      await saveExternalCredentials(api, 'pagarme', payload, false);
                    }
                    const res = await api.validatePagarmeWebhooks();
                    const st = res.data;
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            pagarme_status: {
                              ...(prev.pagarme_status || {}),
                              webhooks: st,
                            },
                            enabled: st?.ready ? true : prev.enabled,
                          }
                        : prev
                    );
                    if (st?.ready) {
                      setPagarmeForceEdit(false);
                      reportMsg('misc', 'Webhooks válidos — Pagar.me conectado');
                    } else {
                      reportError(
                        'misc',
                        st?.reason ||
                          'Ainda não encontramos o webhook do link. Isso pode levar até 1 minuto — tente novamente em breve.'
                      );
                    }
                    await reload();
                  } catch (err) {
                    reportError('misc', err.message || 'Falha ao validar webhooks');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {busy ? 'Validando…' : 'Validar webhooks'}
              </button>
            </div>
          </form>
        </section>
      )}



      {service === 'soucannabis_orders' && (
        <>
          <section
            data-testid="sc-split-mode"
            style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd' }}
          >
            <h3 style={{ marginTop: 0 }}>Modo split</h3>
            {!data.sc_status?.pagarme_ok && (
              <p role="alert" style={{ color: '#b00020' }} data-testid="sc-pagarme-gate">
                Ative e autentique o Pagar.me (conta PSP) antes de informar o ID do recebedor e
                ligar o módulo.
              </p>
            )}
            {data.sc_status && (
              <ul style={{ fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 16 }}>
                <li>
                  Conta PSP:{' '}
                  {data.sc_status.is_psp ? (
                    <span style={{ color: '#2e7d32' }}>sim</span>
                  ) : (
                    <span style={{ color: '#b00020' }}>não</span>
                  )}
                </li>
                <li>
                  payment_percentage:{' '}
                  <strong data-testid="sc-pct">
                    {data.sc_status.payment_percentage ?? '—'}
                  </strong>
                  {data.sc_status.payment_percentage_ok === false && (
                    <span style={{ color: '#b00020' }}> (não inteiro — bloqueado)</span>
                  )}
                </li>
                <li>
                  Recipient associação:{' '}
                  <code data-testid="assoc-recipient-id">
                    {data.sc_status.association_recipient_id || '—'}
                  </code>
                </li>
                <li>
                  Recipient SouCannabis:{' '}
                  <code data-testid="sc-recipient-id">
                    {data.sc_status.soucannabis_recipient_id ||
                      'ainda não criado (outbound SC → POST …/pagarme/recipients)'}
                  </code>
                </li>
                <li>
                  Split pronto:{' '}
                  {data.sc_status.split_ready ? (
                    <span style={{ color: '#2e7d32' }}>sim</span>
                  ) : (
                    <span style={{ color: '#b00020' }}>não</span>
                  )}
                </li>
              </ul>
            )}
            <h4 style={{ margin: '0 0 8px' }}>Recebedor da associação</h4>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Cadastre o recebedor no painel Pagar.me e informe o ID aqui (ex.:{' '}
              <code>re_…</code> ou <code>rp_…</code>).
            </p>
            <form
              data-testid="association-recipient-id-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                clearFeedback();
                try {
                  const id = String(assocRecipientDraft || '').trim();
                  await saveExternalServiceFlags(api, service, {
                    association_recipient_id: id || null,
                  });
                  reportMsg('misc',
                    id
                      ? `Recebedor da associação gravado: ${id}`
                      : 'Recebedor da associação removido'
                  );
                  await reload();
                } catch (err) {
                  reportError('misc', err.message || 'Falha ao gravar recipient_id');
                } finally {
                  setSaving(false);
                }
              }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
            >
              <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
                <label htmlFor="assoc-recipient-id-input">ID do recebedor</label>
                <input
                  id="assoc-recipient-id-input"
                  className="input"
                  data-testid="assoc-recipient-id-input"
                  value={assocRecipientDraft}
                  disabled={busy || !Boolean(data.sc_status?.is_psp || data.sc_status?.pagarme_ok)}
                  onChange={(e) => setAssocRecipientDraft(e.target.value)}
                  placeholder="re_… ou rp_…"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="save-assoc-recipient-id"
                disabled={busy || !Boolean(data.sc_status?.is_psp || data.sc_status?.pagarme_ok)}
              >
                {busy ? 'Salvando…' : 'Salvar ID'}
              </button>
            </form>
          </section>

          <section
            data-testid="sc-setup"
            style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd' }}
          >
            <h3 style={{ marginTop: 0 }}>Outbound (SC → esta instalação)</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Credenciais que a SouCannabis usa para espelhar pedidos e cadastrar o recipient SC via{' '}
              <code>POST …/outbound/pagarme/recipients</code>.
            </p>
            {data.sc_status?.remote_app_id != null && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                remote_app_id: {data.sc_status.remote_app_id || '—'}
              </p>
            )}
            <button
              type="button"
              className="btn"
              data-testid="sc-outbound-creds"
              style={{ marginTop: 8 }}
              onClick={async () => {
                clearFeedback();
                try {
                  const res = await api.getSoucannabisOutboundCredentials({ reveal: true });
                  setOutboundCreds(res.data);
                  reportMsg('misc', 'Credenciais outbound geradas/carregadas');
                } catch (err) {
                  reportError('misc', err.message || 'Falha ao obter outbound');
                }
              }}
            >
              Gerar / mostrar credenciais outbound
            </button>
            {outboundCreds && (
              <div
                data-testid="sc-outbound-panel"
                style={{
                  marginTop: 12,
                  padding: '0.85rem 1rem',
                  background: '#f7f7f7',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  color: '#000',
                }}
              >
                <p style={{ color: '#000' }}>
                  client_id: <code style={{ color: '#000' }}>{outboundCreds.client_id}</code>
                </p>
                {outboundCreds.client_secret && (
                  <p style={{ color: '#000' }}>
                    client_secret:{' '}
                    <code style={{ color: '#000' }}>{outboundCreds.client_secret}</code>
                  </p>
                )}
                {outboundCreds.base_url && (
                  <p style={{ color: '#000' }}>
                    base_url: <code style={{ color: '#000' }}>{outboundCreds.base_url}</code>
                  </p>
                )}
                {outboundCreds.paths && (
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', color: '#000' }}>
                    {Object.entries(outboundCreds.paths).map(([k, v]) => (
                      <li key={k}>
                        {k}: <code style={{ color: '#000' }}>{v}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section
            data-testid="sc-webhook-sync"
            style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd' }}
          >
            <h3 style={{ marginTop: 0 }}>Webhook — sincronização manual de pedidos</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Endpoint para o Kunk legado enviar atualizações de pedidos (sync manual). Autenticado com as{' '}
              <strong>credenciais outbound</strong> (as mesmas de “Gerar / mostrar credenciais outbound”
              acima).
            </p>
            <button
              type="button"
              className="btn"
              data-testid="sc-webhook-info"
              style={{ marginTop: 8 }}
              onClick={async () => {
                clearFeedback();
                try {
                  const res = await api.getSoucannabisWebhooksInfo();
                  setWebhookInfo(res.data);
                  reportMsg('misc', 'URL do webhook carregada');
                } catch (err) {
                  reportError('misc', err.message || 'Falha ao obter webhook');
                }
              }}
            >
              Mostrar URL do webhook
            </button>
            {webhookInfo && (
              <div
                data-testid="sc-webhook-panel"
                style={{
                  marginTop: 12,
                  padding: '0.85rem 1rem',
                  background: '#f7f7f7',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  color: '#000',
                }}
              >
                <p style={{ color: '#000', marginTop: 0 }}>
                  Auth: {webhookInfo.auth || 'client_id / client_secret outbound'}
                </p>
                <p style={{ color: '#000' }}>
                  Token:{' '}
                  <code style={{ color: '#000', wordBreak: 'break-all' }}>{webhookInfo.token_url}</code>
                </p>
                <p style={{ color: '#000' }}>
                  Sync pedidos:{' '}
                  <code style={{ color: '#000', wordBreak: 'break-all' }}>
                    {webhookInfo.orders_sync_url}
                  </code>
                </p>
                <p className="muted" style={{ fontSize: '0.8rem', color: '#333' }}>
                  <code>POST</code> token com outbound <code>{'{ client_id, client_secret }'}</code> →
                  depois <code>POST</code> sync com <code>Authorization: Bearer …</code> (também vale o
                  token de <code>…/outbound/auth/token</code>). Alternativa: HTTP Basic ou{' '}
                  <code>X-Client-Id</code> + <code>X-Client-Secret</code>.
                </p>
                <pre
                  style={{
                    margin: '0.75rem 0 0',
                    padding: '0.75rem',
                    background: '#fff',
                    borderRadius: 6,
                    overflow: 'auto',
                    fontSize: '0.75rem',
                    color: '#000',
                  }}
                >
                  {JSON.stringify(
                    webhookInfo.example?.sync?.body || {
                      orders: [
                        {
                          id: 47368,
                          external_id: 'uuid-do-pedido-oss',
                          status: 'Aguardando aprovação',
                          tracking_code: 'ABC123',
                          external_delivery_type: 'loggi',
                        },
                      ],
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </section>
        </>
      )}

      {service === 'email' && (
        <form
          onSubmit={onSendTestEmail}
          data-testid="email-test-form"
          style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd' }}
        >
          <h3 style={{ marginTop: 0 }}>E-mail de teste</h3>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Envia uma mensagem padrão para validar envio real (além do VERIFY da conexão).
          </p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="test-email-to">Destinatário</label>
            <input
              id="test-email-to"
              className="input"
              type="email"
              data-testid="test-email-to"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="voce@exemplo.com"
              required
            />
          </div>
          <button
            type="submit"
            className="btn"
            data-testid="send-test-email"
            disabled={sendingTestEmail || !testEmailTo}
          >
            {sendingTestEmail ? 'Enviando…' : 'Enviar e-mail de teste'}
          </button>
        </form>
      )}

      {service === 'utalk' && (
        <section style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Mensagens da triagem</h3>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Ao preencher o formulário público de triagem, envia esta mensagem WhatsApp para o
            telefone informado (via Utalk). Requer <code>from_phone</code> nas credenciais e módulo
            ativo. Placeholders: <code>{'{{nome}}'}</code>, <code>{'{{telefone}}'}</code>.
          </p>
          <label
            className={`ext-flag${data.triage_message_enabled ? ' ext-flag--active' : ''}`}
          >
            <input
              type="checkbox"
              checked={Boolean(data.triage_message_enabled)}
              disabled={!data.enabled || busy || triageMessageSaving}
              onChange={async (e) => {
                const checked = e.target.checked;
                clearFeedback();
                setTriageMessageSaving(true);
                try {
                  const payload = { triage_message_enabled: checked };
                  if (checked) payload.triage_message = triageMessageDraft;
                  await saveExternalServiceFlags(api, service, payload);
                  reportMsg(
                    'misc',
                    checked
                      ? 'Envio da mensagem da triagem ativado'
                      : 'Envio da mensagem da triagem desativado'
                  );
                  await reload();
                } catch (err) {
                  reportError('misc', err.message || 'Falha ao atualizar mensagem da triagem');
                } finally {
                  setTriageMessageSaving(false);
                }
              }}
            />
            <span className="ext-flag-body">
              <strong>Enviar mensagem ao criar triagem</strong>
              <span className="muted">
                {!data.enabled
                  ? 'Ative o módulo Utalk acima para habilitar o envio.'
                  : 'Desligado por padrão. O envio é fail-soft (não bloqueia o formulário).'}
              </span>
            </span>
          </label>
          <div className="field">
            <label htmlFor="utalk-triage-message">Texto da mensagem</label>
            <textarea
              id="utalk-triage-message"
              className="input"
              rows={5}
              value={triageMessageDraft}
              disabled={busy || triageMessageSaving}
              onChange={(e) => setTriageMessageDraft(e.target.value)}
              placeholder="Olá {{nome}}, recebemos seu contato. Em breve retornamos pelo WhatsApp {{telefone}}."
            />
          </div>
          <div className="ext-action-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || triageMessageSaving}
            onClick={async () => {
              setTriageMessageSaving(true);
              clearFeedback();
              try {
                await saveExternalServiceFlags(api, service, {
                  triage_message: triageMessageDraft,
                });
                reportMsg('misc', 'Mensagem da triagem salva');
                await reload();
              } catch (err) {
                reportError('misc', err.message || 'Falha ao salvar mensagem');
              } finally {
                setTriageMessageSaving(false);
              }
            }}
          >
            {triageMessageSaving ? 'Salvando…' : 'Salvar mensagem'}
          </button>
          </div>
        </section>
      )}

      {service === 'utalk' && (
        <section style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Atendentes (utalk_id)</h3>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            O token acima é único e serve para sync/transfer. Cadastre o{' '}
            <code>utalk_id</code> (member ID Umbler) de cada operador de triagem para mapear
            assume/transferência no card.
          </p>
          {(data.attendants || []).length === 0 ? (
            <p className="muted">Nenhum operador Acolhimento/Administrador ativo.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {(data.attendants || []).map((att) => (
                <div
                  key={att.code}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.65rem 0.75rem',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ minWidth: 160, flex: '1 1 140px' }}>
                    <strong>{att.name}</strong>
                    {att.email ? (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {att.email}
                      </div>
                    ) : null}
                  </div>
                  <label className="field" style={{ flex: '1 1 200px', minWidth: 160, margin: 0 }}>
                    <span>utalk_id</span>
                    <input
                      className="input"
                      placeholder="member ID Umbler"
                      value={utalkIdDrafts[att.code] ?? ''}
                      onChange={(e) =>
                        setUtalkIdDrafts((prev) => ({ ...prev, [att.code]: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={utalkAttendantSaving === att.code || busy}
                    onClick={async () => {
                      setUtalkAttendantSaving(att.code);
                      clearFeedback();
                      try {
                        await api.updateUtalkAttendantAdmin(att.code, {
                          utalk_id: utalkIdDrafts[att.code] || null,
                        });
                        reportMsg('misc', `utalk_id salvo para ${att.name}`);
                        await reload();
                      } catch (err) {
                        reportError('misc', err.message || 'Falha ao salvar utalk_id');
                      } finally {
                        setUtalkAttendantSaving(null);
                      }
                    }}
                  >
                    {utalkAttendantSaving === att.code ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ExtActionFeedback at="misc" feedbackAt={feedbackAt} error={error} msg={msg} />
      <ExtActionFeedback at="email-test" feedbackAt={feedbackAt} error={error} msg={msg} />
    </div>
    </div>
  );
}
