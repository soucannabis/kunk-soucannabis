import React, { useEffect, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';

function CopyIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CredentialsRevealModal({ email, password, loginUrl, onClose }) {
  const [copiedField, setCopiedField] = useState('');

  async function copy(value, field) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(''), 1600);
    } catch {
      setCopiedField('');
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-creds-reveal-title"
    >
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <h2 id="support-creds-reveal-title" style={{ marginTop: 0 }}>
          Credenciais de suporte
        </h2>
        <p className="muted">
          Copie o e-mail e a senha agora. A senha não será exibida novamente após fechar esta janela.
        </p>

        {loginUrl ? (
          <>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
              URL de login
            </span>
            <div className="support-cred-row">
              <p className="support-cred-value" data-testid="support-login-url">
                {loginUrl}
              </p>
              <button
                type="button"
                className="btn btn-icon"
                title={copiedField === 'login' ? 'Copiado' : 'Copiar URL de login'}
                aria-label={copiedField === 'login' ? 'Copiado' : 'Copiar URL de login'}
                onClick={() => copy(loginUrl, 'login')}
              >
                {copiedField === 'login' ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </>
        ) : null}

        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          E-mail
        </span>
        <div className="support-cred-row">
          <p className="support-cred-value" data-testid="support-email-plaintext">
            {email}
          </p>
          <button
            type="button"
            className="btn btn-icon"
            title={copiedField === 'email' ? 'Copiado' : 'Copiar e-mail'}
            aria-label={copiedField === 'email' ? 'Copiado' : 'Copiar e-mail'}
            onClick={() => copy(email, 'email')}
          >
            {copiedField === 'email' ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
          Senha
        </span>
        <div className="support-cred-row">
          <p className="support-cred-value" data-testid="support-password-plaintext">
            {password}
          </p>
          <button
            type="button"
            className="btn btn-icon"
            title={copiedField === 'password' ? 'Copiado' : 'Copiar senha'}
            aria-label={copiedField === 'password' ? 'Copiado' : 'Copiar senha'}
            onClick={() => copy(password, 'password')}
          >
            {copiedField === 'password' ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            data-testid="support-creds-reveal-close"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupportCredentialsPage({ api }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [defaultEmail, setDefaultEmail] = useState('support@example.com');
  const [email, setEmail] = useState('support@example.com');
  const [user, setUser] = useState(null);
  const [revealed, setRevealed] = useState(null);

  async function refresh() {
    const res = await api.getSupportCredentials();
    const data = res.data || {};
    const nextDefault = data.default_email || 'support@example.com';
    setDefaultEmail(nextDefault);
    setUser(data.user || null);
    if (!data.user) {
      setEmail(nextDefault);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [api]);

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.createSupportCredentials({ email: email.trim() || defaultEmail });
      const fallbackLogin =
        typeof window !== 'undefined' ? `${window.location.origin}/login` : '';
      setRevealed({
        email: res.data?.email || res.data?.user?.email,
        password: res.data?.password,
        loginUrl: res.data?.login_url || fallbackLogin,
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao criar usuário de suporte');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        'Remover o usuário de suporte? Ele perderá o acesso imediatamente e a senha atual deixará de valer.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.deleteSupportCredentials();
      setMessage('Usuário de suporte removido.');
      setRevealed(null);
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao remover');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AdminLoader label="Carregando credenciais de suporte…" />;

  return (
    <div className="support-credentials-page">
      <h1 style={{ marginTop: 0 }}>Credenciais de suporte</h1>
      <p className="muted">
        Cria um operador com acesso total (Administrador) para suporte da instância. A senha é
        gerada automaticamente e só aparece uma vez, no momento da criação.
      </p>

      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="alert alert-success" role="status">
          {message}
        </p>
      ) : null}

      {user ? (
        <section className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Usuário ativo</h2>
          <dl style={{ margin: 0, display: 'grid', gap: '0.5rem' }}>
            <div>
              <dt className="muted" style={{ margin: 0 }}>
                E-mail
              </dt>
              <dd style={{ margin: 0 }} data-testid="support-user-email">
                {user.email}
              </dd>
            </div>
          </dl>
          <p className="muted" style={{ marginTop: '1rem' }}>
            A senha não pode ser recuperada nesta tela. Para trocar o acesso, remova o usuário e
            crie outro.
          </p>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={busy}
            data-testid="support-delete"
          >
            Remover usuário
          </button>
        </section>
      ) : (
        <section className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Criar usuário de suporte</h2>
          <form onSubmit={onCreate}>
            <div className="field">
              <label htmlFor="support-email">E-mail</label>
              <input
                id="support-email"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                data-testid="support-email-input"
              />
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Perfil: <strong>Administrador</strong> (acesso total). A senha será gerada
              automaticamente.
            </p>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              data-testid="support-create"
            >
              {busy ? 'Criando…' : 'Criar usuário'}
            </button>
          </form>
        </section>
      )}

      {revealed?.password ? (
        <CredentialsRevealModal
          email={revealed.email}
          password={revealed.password}
          loginUrl={revealed.loginUrl}
          onClose={() => setRevealed(null)}
        />
      ) : null}
    </div>
  );
}
