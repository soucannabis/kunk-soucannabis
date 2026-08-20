import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAssociateAuth } from '@kunk/auth-session';
import { AlertError, AuthLoginCard, PasswordInput } from '@kunk/ui';
import { ApiError } from '@kunk/api-client';
import { Icon } from '../components/Icon.jsx';

const MIN_PASSWORD_LENGTH = 8;

export function SignupPage() {
  const { registerEmail } = useAssociateAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      await registerEmail(email.trim(), password);
      navigate('/bem-vindo');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_EXISTS' || err.code === 'ACCOUNT_IN_PROGRESS') {
          setError(`${err.message} Vá para o login.`);
        } else setError(err.message);
      } else setError('Falha ao cadastrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLoginCard onSubmit={onSubmit} heading="Cadastro de Associado">
      <p className="auth-login-card-lead">
        Para iniciar seu cadastro, preencha seu e-mail e defina uma senha.
      </p>
      <AlertError message={error} />
      <div className="auth-login-field">
        <label htmlFor="signup-email">E-mail</label>
        <input
          id="signup-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="auth-login-field">
        <label htmlFor="signup-password">Senha</label>
        <PasswordInput
          id="signup-password"
          className=""
          wrapperClassName=""
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            const next = e.target.value;
            setPassword(next);
            if (!next) setPasswordConfirm('');
          }}
        />
      </div>
      {password.length > 0 ? (
        <div className="auth-login-field">
          <label htmlFor="signup-password-confirm">Confirmar senha</label>
          <PasswordInput
            id="signup-password-confirm"
            className=""
            wrapperClassName=""
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </div>
      ) : null}
      <div className="auth-login-actions">
        <button className="auth-login-submit" type="submit" disabled={busy}>
          <Icon name="userPlus" size={18} />
          Se cadastrar como Associado
        </button>
        <Link className="auth-login-secondary" to="/login">
          <Icon name="logIn" size={16} />
          Já tenho conta — Login
        </Link>
      </div>
    </AuthLoginCard>
  );
}

export function LoginPage() {
  const { login } = useAssociateAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLoginCard onSubmit={onSubmit}>
      <AlertError message={error} />
      <div className="auth-login-field">
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="auth-login-field">
        <label htmlFor="login-password">Senha</label>
        <PasswordInput
          id="login-password"
          className=""
          wrapperClassName=""
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="auth-login-actions">
        <button className="auth-login-submit" type="submit" disabled={busy}>
          <Icon name="logIn" size={18} />
          Entrar
        </button>
        <Link className="auth-login-link" to="/nova-senha">
          <Icon name="key" size={16} />
          Esqueci a senha
        </Link>
        <Link className="auth-login-secondary" to="/cadastro">
          <Icon name="userPlus" size={16} />
          Criar conta
        </Link>
      </div>
    </AuthLoginCard>
  );
}

export function NewPasswordPage({ api }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState(token ? 'reset' : 'forgot');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function onForgot(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setMessage('Se o e-mail existir, enviaremos instruções.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }
    try {
      await api.resetPassword(token, password);
      setMessage('Senha atualizada. Faça login.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthLoginCard as="div" heading="Nova senha">
      <AlertError message={error} />
      {message ? <div className="alert alert-success">{message}</div> : null}
      {mode === 'forgot' ? (
        <form onSubmit={onForgot}>
          <div className="auth-login-field">
            <label htmlFor="forgot-email">E-mail</label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-login-actions">
            <button className="auth-login-submit" type="submit">
              <Icon name="mail" size={18} />
              Enviar link
            </button>
            <button type="button" className="auth-login-link" onClick={() => setMode('reset')}>
              <Icon name="key" size={16} />
              Já tenho o token
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={onReset}>
          <div className="auth-login-field">
            <label htmlFor="reset-token">Token</label>
            <input
              id="reset-token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="auth-login-field">
            <label htmlFor="reset-password">Nova senha</label>
            <PasswordInput
              id="reset-password"
              className=""
              wrapperClassName=""
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-login-field">
            <label htmlFor="reset-password-confirm">Confirmar senha</label>
            <PasswordInput
              id="reset-password-confirm"
              className=""
              wrapperClassName=""
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          <div className="auth-login-actions">
            <button className="auth-login-submit" type="submit">
              <Icon name="lock" size={18} />
              Redefinir
            </button>
          </div>
        </form>
      )}
    </AuthLoginCard>
  );
}
