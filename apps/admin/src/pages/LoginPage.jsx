import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getPublicConfig, mergePublicConfigFromApi, isPlaceholderLogo, resolvePlacementLogo } from '@kunk/config';
import { useOperatorAuth } from '@kunk/auth-session';
import { safeInternalPath } from '../lib/lastRoute.js';
import { useInstallStatus } from '../lib/installStatus.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';

const LOGIN_HOME = '/home';

/** Só exibe logo real da associação — ignora placeholder de bootstrap. */
function resolveLoginLogo(href) {
  if (isPlaceholderLogo(href)) return '';
  return String(href || '').trim();
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const url = String(src || '').trim();
    if (!url) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

export function LoginPage({ api }) {
  const { user, loading, hasRequiredRole, login } = useOperatorAuth();
  const { needsInstall, canInstallSample, loading: installLoading } = useInstallStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFormat, setLogoFormat] = useState('square');
  const [logoWidth, setLogoWidth] = useState(72);
  const [brandingReady, setBrandingReady] = useState(false);
  const [logoPainted, setLogoPainted] = useState(false);

  const installedBanner = searchParams.get('installed') === '1';
  // Pós-login vai para Home, salvo deep link explícito ?next=
  const nextPath = safeInternalPath(searchParams.get('next') || LOGIN_HOME, LOGIN_HOME);

  useEffect(() => {
    if (!api?.get) {
      setBrandingReady(true);
      setLogoPainted(true);
      return undefined;
    }
    let cancelled = false;
    setBrandingReady(false);
    setLogoPainted(false);
    (async () => {
      let nextLogo = '';
      let nextFormat = 'square';
      let nextW = 72;
      try {
        const res = await api.get('/config/public?system=registration');
        if (cancelled) return;
        const merged = mergePublicConfigFromApi(getPublicConfig(), res?.data?.values || {});
        const placement = resolvePlacementLogo({
          placements: merged.associationLogoPlacements,
          app: 'admin',
          surface: 'login',
          square: merged.associationLogoSquare,
          rectangular: merged.associationLogoRectangular,
          legacy: merged.associationLogo,
        });
        nextLogo = resolveLoginLogo(placement.url);
        nextFormat = placement.format;
        nextW = placement.width;
      } catch {
        nextLogo = '';
      }
      await preloadImage(nextLogo);
      if (cancelled) return;
      setLogoUrl(nextLogo);
      setLogoFormat(nextFormat);
      setLogoWidth(nextW);
      setBrandingReady(true);
      if (!nextLogo) setLogoPainted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (installLoading || needsInstall == null) {
    return <AdminLoader label="Verificando instalação…" className="admin-loader--viewport" />;
  }
  if (needsInstall || canInstallSample) {
    return <Navigate to="/instalacao" replace />;
  }

  if (!loading && user && hasRequiredRole) {
    return <Navigate to={nextPath} replace />;
  }
  if (!loading && user && !hasRequiredRole) {
    return <Navigate to="/sem-permissao" replace />;
  }

  if (loading || !brandingReady || !logoPainted) {
    return (
      <>
        <AdminLoader label="Carregando…" className="admin-loader--viewport" />
        {brandingReady && logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            aria-hidden
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            onLoad={() => setLogoPainted(true)}
            onError={() => setLogoPainted(true)}
          />
        ) : null}
      </>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      const perms = res.data?.user?.permissions || res.data?.user?.roles || [];
      let roles = perms;
      if (typeof perms === 'string') {
        try {
          roles = JSON.parse(perms);
        } catch {
          roles = String(perms).split(',').map((s) => s.trim());
        }
      }
      if (!Array.isArray(roles) || !roles.includes('Administrador')) {
        navigate('/sem-permissao');
        return;
      }
      navigate(nextPath);
    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          {logoUrl ? (
            <div className="login-logo-wrap">
              <img
                className={`login-logo login-logo--${logoFormat}`}
                src={logoUrl}
                alt="Logo da associação"
                style={{
                  width: logoWidth,
                  height: 'auto',
                }}
                onError={() => setLogoUrl('')}
              />
            </div>
          ) : null}
          <h1>Admin</h1>
        </div>
        <p className="muted login-subtitle">Acesso restrito a operadores com role Administrador.</p>
        {installedBanner ? (
          <div className="alert alert-success" role="status">
            Instalação concluída. Entre com o e-mail e senha cadastrados.
          </div>
        ) : null}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="login-actions">
          <Link className="login-forgot" to="/nova-senha">
            Esqueci a senha
          </Link>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
