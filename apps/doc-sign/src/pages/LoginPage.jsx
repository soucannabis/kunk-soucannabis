import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import { AuthLoginCard, AuthLoginLayout, PasswordInput } from '@kunk/ui';
import { DOCSIGN_PRODUCT_TITLE, useDocSignBranding } from '../components/DocSignBrand.jsx';
import { getMissingAssociationFields } from '../lib/associationGate.js';
import loginBg from '../assets/doc-sign-login-bg.jpg';

function AssociationIncompleteModal({ missing, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assoc-incomplete-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="assoc-incomplete-title" style={{ margin: 0 }}>
            Dados da associação incompletos
          </h2>
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
        <p style={{ marginTop: 0 }}>
          Não é possível entrar na Assinatura de Termos enquanto os dados da associação não
          estiverem completos no painel administrativo.
        </p>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          Preencha em <strong>Admin → Dados da associação</strong>:
        </p>
        <ul style={{ marginTop: 0, paddingLeft: '1.25rem' }}>
          {missing.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

export function LoginPage({ api }) {
  const { login, logout, user } = useOperatorAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { logo, logoFormat, logoWidth, brandingReady } = useDocSignBranding(api);
  const [missingFields, setMissingFields] = useState(() =>
    Array.isArray(location.state?.associationMissing) ? location.state.associationMissing : null
  );
  const gatingRef = useRef(false);

  useEffect(() => {
    if (!user || gatingRef.current || missingFields?.length) return;
    let cancelled = false;
    (async () => {
      gatingRef.current = true;
      try {
        const missing = await getMissingAssociationFields(api);
        if (cancelled) return;
        if (missing.length) {
          await logout();
          setMissingFields(missing);
          return;
        }
        window.location.replace('/termos');
      } catch (err) {
        if (cancelled) return;
        await logout().catch(() => {});
        setError(err.message || 'Não foi possível validar os dados da associação');
      } finally {
        gatingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, api, logout, missingFields]);

  async function performLogin(nextEmail, nextPassword) {
    setBusy(true);
    setError(null);
    setMissingFields(null);
    gatingRef.current = true;
    try {
      await login(nextEmail, nextPassword);
      const missing = await getMissingAssociationFields(api);
      if (missing.length) {
        await logout();
        setMissingFields(missing);
        return;
      }
      window.location.assign('/termos');
    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      gatingRef.current = false;
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    await performLogin(email, password);
  }

  return (
    <>
      <AuthLoginLayout
        backgroundImage={loginBg}
        logo={logo}
        logoFormat={logoFormat}
        logoWidth={logoWidth}
        title={DOCSIGN_PRODUCT_TITLE}
        ready={brandingReady}
      >
        <AuthLoginCard onSubmit={onSubmit}>
          {error ? (
            <div className="auth-login-alert" role="alert">
              {error}
            </div>
          ) : null}
          <div className="auth-login-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="auth-login-field">
            <label htmlFor="password">Senha</label>
            <PasswordInput
              id="password"
              className=""
              wrapperClassName=""
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-login-actions">
            <button className="auth-login-submit" type="submit" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <Link className="auth-login-link" to="/nova-senha">
              Esqueci a senha
            </Link>
          </div>
        </AuthLoginCard>
      </AuthLoginLayout>

      {missingFields?.length ? (
        <AssociationIncompleteModal missing={missingFields} onClose={() => setMissingFields(null)} />
      ) : null}
    </>
  );
}
