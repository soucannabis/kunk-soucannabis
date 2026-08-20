import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const MIN_PASSWORD_LENGTH = 8;

function validatePassword(password) {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  );
}

export function NewPasswordPage({ api }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [mode, setMode] = useState(token ? 'reset' : 'forgot');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onForgot(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.forgotOperatorPassword(email.trim(), 'doc-sign');
      setMessage('Se o e-mail existir, enviaremos instruções de redefinição.');
    } catch (err) {
      setError(err.message || 'Falha ao solicitar redefinição');
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    setError('');
    if (!validatePassword(password)) {
      setError('Senha: mínimo 8 caracteres, 1 maiúscula e 1 caractere especial.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      await api.resetOperatorPassword(token, password);
      setMessage('Senha atualizada. Faça login.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.message || 'Falha ao redefinir senha');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 420 }}>
      <h1 className="brand">Nova senha</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {mode === 'forgot' ? (
        <form className="card" onSubmit={onForgot}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Enviar link
          </button>
          <button type="button" className="btn" onClick={() => setMode('reset')}>
            Já tenho o token
          </button>
        </form>
      ) : (
        <form className="card" onSubmit={onReset}>
          <div className="field">
            <label htmlFor="token">Token</label>
            <input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="passwordConfirm">Confirmar senha</label>
            <input
              id="passwordConfirm"
              type="password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Salvar nova senha
          </button>
        </form>
      )}
      <p className="muted">
        <Link to="/login">Voltar ao login</Link>
      </p>
    </div>
  );
}
