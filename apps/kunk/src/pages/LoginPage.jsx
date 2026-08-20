import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import { resolvePlacementLogo } from '@kunk/config';
import { AuthLoginCard, AuthLoginLayout, PasswordInput } from '@kunk/ui';
import { useKunkConfig } from '../config/KunkConfigProvider.jsx';
import { KUNK_APP_ROLES } from '../app/menuConfig.js';
import { hasAnyRole, roleHomePath } from '../auth/roleRedirect.js';
import loginBg from '../assets/kunk-login-bg.jpg';

function parseRoles(permissions) {
  if (!permissions) return [];
  if (Array.isArray(permissions)) return permissions;
  try {
    const parsed = JSON.parse(permissions);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return String(permissions)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validatePassword(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    specialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

export function LoginPage() {
  const { user, loading, hasRequiredRole, login, roles } = useOperatorAuth();
  const { config, configReady } = useKunkConfig();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);

  const placement = resolvePlacementLogo({
    placements: config.logoPlacements,
    app: 'kunk',
    surface: 'login',
    square: config.logoSquare,
    rectangular: config.logoRectangular,
    legacy: config.logo,
  });
  const title = String(config.title || '').trim() || 'Kunk';

  if (!loading && user && hasRequiredRole) {
    return <Navigate to={roleHomePath(roles)} replace />;
  }
  if (!loading && user && !hasRequiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (name === 'password' && passwordError) setPasswordError('');
  }

  async function performLogin(username, password) {
    setBusy(true);
    setError(null);
    setPasswordError('');
    try {
      const res = await login(username.trim(), password);
      const userRoles = parseRoles(res.data?.user?.permissions || res.data?.user?.roles);
      if (!hasAnyRole(userRoles, KUNK_APP_ROLES)) {
        navigate('/unauthorized');
        return;
      }
      navigate(roleHomePath(userRoles));
    } catch (err) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('network') || msg === 'Failed to fetch') {
        navigate('/not-connected');
        return;
      }
      if (msg.toLowerCase().includes('senha') || msg.toLowerCase().includes('password') || msg.toLowerCase().includes('credenciais')) {
        setPasswordError('Senha inválida.');
        setError(null);
      } else {
        setError(msg || 'E-mail ou senha inválidos');
        setPasswordError(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.length || !passwordValidation.uppercase || !passwordValidation.specialChar) {
      setPasswordError('A senha deve ter pelo menos 8 caracteres, uma letra maiúscula e um caractere especial');
      setError(null);
      return;
    }
    await performLogin(formData.username, formData.password);
  }

  return (
    <AuthLoginLayout
      backgroundImage={loginBg}
      logo={placement.url}
      logoFormat={placement.format}
      logoWidth={placement.width}
      title={title}
      ready={configReady && !loading}
    >
      <AuthLoginCard onSubmit={handleSubmit}>
        {error ? (
          <div className="auth-login-alert" role="alert">
            {error}
          </div>
        ) : null}
        {passwordError ? (
          <div className="auth-login-alert" role="alert">
            {passwordError}
          </div>
        ) : null}
        <div className="auth-login-field">
          <label htmlFor="username">E-mail</label>
          <input
            id="username"
            name="username"
            type="email"
            required
            autoComplete="username"
            autoFocus
            value={formData.username}
            onChange={handleChange}
          />
        </div>
        <div className="auth-login-field">
          <label htmlFor="password">Senha</label>
          <PasswordInput
            id="password"
            name="password"
            className=""
            wrapperClassName=""
            required
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
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
  );
}
