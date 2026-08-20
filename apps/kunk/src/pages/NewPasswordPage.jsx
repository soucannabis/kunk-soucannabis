import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, TextField, Button, Box, Typography, Alert } from '@mui/material';
import { createApiClient } from '@kunk/api-client';
import { useKunkConfig } from '../config/KunkConfigProvider.jsx';

const MIN_PASSWORD_LENGTH = 8;
const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL || '', app: 'kunk' });

function validatePassword(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    specialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

export function NewPasswordPage() {
  const { config } = useKunkConfig();
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

  const primary = config.darkPrimary || '#5a7a5b';

  async function onForgot(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.forgotOperatorPassword(email.trim(), 'kunk');
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
    const checks = validatePassword(password);
    if (!checks.length || !checks.uppercase || !checks.specialChar) {
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
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h5" sx={{ mb: 2, color: primary }}>
        Nova senha
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {message ? <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert> : null}
      {mode === 'forgot' ? (
        <Box component="form" onSubmit={onForgot}>
          <TextField
            fullWidth
            label="E-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ bgcolor: primary }}>
            Enviar link
          </Button>
          <Button type="button" onClick={() => setMode('reset')} sx={{ ml: 1 }}>
            Já tenho o token
          </Button>
          <Box mt={2}>
            <Link to="/login">Voltar ao login</Link>
          </Box>
        </Box>
      ) : (
        <Box component="form" onSubmit={onReset}>
          <TextField
            fullWidth
            label="Token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Nova senha"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 2 }}
            helperText={`Mín. ${MIN_PASSWORD_LENGTH} caracteres, maiúscula e especial`}
          />
          <TextField
            fullWidth
            label="Confirmar senha"
            type="password"
            required
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ bgcolor: primary }}>
            Salvar nova senha
          </Button>
          <Box mt={2}>
            <Link to="/login">Voltar ao login</Link>
          </Box>
        </Box>
      )}
    </Container>
  );
}
