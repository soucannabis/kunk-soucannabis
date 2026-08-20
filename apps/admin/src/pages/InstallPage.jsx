import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ASSOCIATION_DATA_DEFAULTS } from '@kunk/config';
import {
  AssociationDataFields,
  validateAssociationForm,
} from '../components/AssociationDataFields.jsx';
import { useInstallStatus } from '../lib/installStatus.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';

const MIN_PASSWORD_LENGTH = 8;

const SCHEMA_LOADER_STEPS = [
  'Conectando ao banco de dados…',
  'Criando tabelas do sistema…',
  'Aplicando relações e restrições…',
  'Finalizando estrutura…',
];

function validatePassword(password) {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Falha ao ler a logo'));
        return;
      }
      resolve({ mime: match[1], base64: match[2], dataUrl: result });
    };
    reader.onerror = () => reject(new Error('Falha ao ler a logo'));
    reader.readAsDataURL(file);
  });
}

export function InstallPage({ api }) {
  const {
    needsInstall,
    needsSchema,
    canInstallSample,
    loading: installLoading,
    refresh,
    markInstalled,
    markSampleInstalled,
  } = useInstallStatus();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [association, setAssociation] = useState({ ...ASSOCIATION_DATA_DEFAULTS });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [schemaCreating, setSchemaCreating] = useState(false);
  const [schemaStepIndex, setSchemaStepIndex] = useState(0);
  const [samplePromptOpen, setSamplePromptOpen] = useState(false);
  const [sampleInstalling, setSampleInstalling] = useState(false);
  const [submittingDone, setSubmittingDone] = useState(false);
  const [error, setError] = useState('');

  const passwordOk = useMemo(() => validatePassword(password), [password]);
  const resumeSampleOnly = Boolean(canInstallSample && !needsInstall);

  useEffect(() => {
    if (!schemaCreating) {
      setSchemaStepIndex(0);
      return undefined;
    }
    const id = window.setInterval(() => {
      setSchemaStepIndex((prev) => (prev + 1) % SCHEMA_LOADER_STEPS.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [schemaCreating]);

  function setAssocField(key, value) {
    setAssociation((prev) => ({ ...prev, [key]: value }));
  }

  function validateForm() {
    if (!String(name).trim()) {
      return 'Nome do administrador é obrigatório.';
    }
    if (!String(email).trim() || !String(email).includes('@')) {
      return 'E-mail do administrador é inválido.';
    }
    if (!passwordOk) {
      return 'Senha: mínimo 8 caracteres, 1 maiúscula e 1 caractere especial.';
    }
    if (password !== passwordConfirm) {
      return 'Confirmação de senha não confere.';
    }
    const missing = validateAssociationForm(association);
    if (missing.length) {
      return `Preencha todos os campos obrigatórios: ${missing.join(', ')}.`;
    }
    return '';
  }

  function buildInstallPayload({ withSample = false } = {}) {
    return {
      name: name.trim(),
      last_name: lastName.trim() || undefined,
      email: email.trim(),
      password,
      password_confirm: passwordConfirm,
      logo_base64: logoFile?.base64 || undefined,
      logo_mime: logoFile?.mime || undefined,
      association,
      demo: Boolean(withSample),
    };
  }

  async function onLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const parsed = await fileToBase64(file);
      setLogoFile({ mime: parsed.mime, base64: parsed.base64, name: file.name });
      setLogoPreview(parsed.dataUrl);
    } catch (err) {
      setError(err.message || 'Falha ao carregar logo');
      setLogoFile(null);
      setLogoPreview('');
    }
  }

  async function onCreateSchema() {
    setError('');
    setSchemaCreating(true);
    setBusy(true);
    try {
      await api.installSchema();
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao criar o banco de dados');
    } finally {
      setSchemaCreating(false);
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSamplePromptOpen(true);
  }

  async function finishInstall({ withSample }) {
    setSamplePromptOpen(false);
    setError('');
    setBusy(true);

    try {
      try {
        await api.install(buildInstallPayload({ withSample }));
      } catch (err) {
        if (err?.code !== 'ALREADY_INSTALLED') throw err;
      }
      setSubmittingDone(true);
      markInstalled({ expectSample: withSample });

      if (withSample) {
        setSampleInstalling(true);
        await api.installSample();
        markSampleInstalled();
      }

      navigate('/login?installed=1', { replace: true });
    } catch (err) {
      setError(err.message || 'Falha na instalação');
      setSampleInstalling(false);
    } finally {
      setBusy(false);
    }
  }

  async function onResumeSample() {
    setError('');
    setBusy(true);
    setSampleInstalling(true);
    try {
      await api.installSample();
      markSampleInstalled();
      navigate('/login?installed=1', { replace: true });
    } catch (err) {
      setError(err.message || 'Falha ao instalar dados de demonstração');
      setSampleInstalling(false);
    } finally {
      setBusy(false);
    }
  }

  if (installLoading || needsInstall == null) {
    return <AdminLoader label="Verificando instalação…" className="admin-loader--viewport" />;
  }
  if (!needsInstall && !canInstallSample && !submittingDone && !busy && !sampleInstalling) {
    return <Navigate to="/login" replace />;
  }

  if (resumeSampleOnly) {
    return (
      <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div className="card login-card" style={{ maxWidth: 560, width: '100%' }}>
          <h1>Dados de demonstração</h1>
          <p className="muted">
            A instalação foi concluída, mas os dados fictícios não terminaram de carregar. Você pode continuar agora ou entrar e instalá-los depois.
          </p>
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="install-sample-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || sampleInstalling}
              onClick={onResumeSample}
            >
              Continuar instalação dos dados
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || sampleInstalling}
              onClick={() => navigate('/login?installed=1', { replace: true })}
            >
              Ir para o login
            </button>
          </div>
        </div>
        {sampleInstalling ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-sample-title">
            <div className="modal-card install-demo-modal">
              <h2 id="install-sample-title" className="install-demo-modal-title">
                Dados de demonstração
              </h2>
              <AdminLoader label="Instalando dados de demonstração..." className="admin-loader--embedded" />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (needsSchema) {
    return (
      <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div className="card login-card" style={{ maxWidth: 560, width: '100%' }}>
          <h1>Instalação</h1>
          <p className="muted">
            O banco de dados está vazio. Crie a estrutura do sistema para seguir com a configuração inicial.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || schemaCreating}
            onClick={onCreateSchema}
            style={{ marginTop: '0.5rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
            </svg>
            {schemaCreating ? 'Criando banco…' : 'Criar banco de dados'}
          </button>
          {error ? (
            <div className="alert alert-error" role="alert" style={{ marginTop: '0.85rem' }}>
              {error}
            </div>
          ) : null}
        </div>

        {schemaCreating ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-schema-title">
            <div className="modal-card install-demo-modal install-schema-modal">
              <h2 id="install-schema-title" className="install-demo-modal-title">
                Criando banco de dados
              </h2>
              <AdminLoader
                label={SCHEMA_LOADER_STEPS[schemaStepIndex]}
                className="admin-loader--embedded"
              />
              <ol className="install-schema-steps" aria-hidden="true">
                {SCHEMA_LOADER_STEPS.map((step, index) => (
                  <li
                    key={step}
                    className={
                      index === schemaStepIndex
                        ? 'install-schema-steps__item is-active'
                        : index < schemaStepIndex
                          ? 'install-schema-steps__item is-done'
                          : 'install-schema-steps__item'
                    }
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem' }}>
      <form
        className="card login-card"
        onSubmit={onSubmit}
        noValidate
        style={{ maxWidth: 560, width: '100%' }}
      >
        <h1>Instalação</h1>
        <p className="muted">
          Configure a conta do administrador principal e os dados da associação. Depois você entrará com o e-mail e a senha criados.
        </p>

        <h2 className="install-section-title">Administrador</h2>
        <div className="install-name-row">
          <div className="field">
            <label htmlFor="install-name">Nome *</label>
            <input
              id="install-name"
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="install-last-name">Sobrenome</label>
            <input
              id="install-last-name"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="install-email">E-mail *</label>
          <input
            id="install-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="install-password">Senha *</label>
          <input
            id="install-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Mín. {MIN_PASSWORD_LENGTH} caracteres, maiúscula e caractere especial
          </span>
        </div>
        <div className="field">
          <label htmlFor="install-password-confirm">Confirmar senha *</label>
          <input
            id="install-password-confirm"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
          />
        </div>

        <h2 className="install-section-title install-section-title--logo">Logo principal</h2>
        <div className="field install-logo-field">
          {logoPreview ? (
            <div className="appearance-preview" style={{ marginBottom: '0.5rem' }}>
              <img src={logoPreview} alt="Pré-visualização da logo" />
            </div>
          ) : null}
          <label className="btn install-logo-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Escolher imagem
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onLogoChange} />
          </label>
          <span className="muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
            Opcional — pode ser definida depois no Admin
          </span>
        </div>

        <h2 className="install-section-title">Dados da associação</h2>
        <AssociationDataFields form={association} onChange={setAssocField} idPrefix="install" />

        <button className="btn btn-primary" type="submit" disabled={busy || sampleInstalling} style={{ marginTop: '1rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          {busy && !sampleInstalling ? 'Instalando…' : 'Concluir instalação'}
        </button>
        {error ? (
          <div className="alert alert-error" role="alert" style={{ marginTop: '0.85rem' }}>
            {error}
          </div>
        ) : null}
      </form>

      {samplePromptOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-sample-prompt-title">
          <div className="modal-card install-sample-prompt">
            <h2 id="install-sample-prompt-title" className="install-demo-modal-title">
              Dados de demonstração
            </h2>
            <p className="install-sample-prompt-text">
              Deseja instalar dados fictícios para demonstração do sistema? Eles podem ser excluídos posteriormente pelo Admin.
            </p>
            <div className="install-sample-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => finishInstall({ withSample: true })}
              >
                Sim
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => finishInstall({ withSample: false })}
              >
                Não
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sampleInstalling ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-sample-title">
          <div className="modal-card install-demo-modal">
            <h2 id="install-sample-title" className="install-demo-modal-title">
              Dados de demonstração
            </h2>
            <AdminLoader label="Instalando dados de demonstração..." className="admin-loader--embedded" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
