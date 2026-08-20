import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Container, TextField, Typography } from '@mui/material';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { PATHS } from '../app/menuConfig.js';

export default function SystemUserInvitePage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', last_name: '', password: '', confirm: '' });

  useEffect(() => {
    if (!token) {
      setError('Link de convite inválido');
      return;
    }
    (async () => {
      try {
        const res = await api.previewSystemUserInvite(token);
        setPreview(res.data || null);
      } catch (err) {
        setError(err.message || 'Convite inválido ou expirado');
      }
    })();
  }, [api, token]);

  async function onSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('As senhas não coincidem');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.acceptSystemUserInvite({
        token,
        password: form.password,
        name: form.name || undefined,
        last_name: form.last_name || undefined,
      });
      navigate('/login', { replace: true, state: { fromInvite: true } });
    } catch (err) {
      setError(err.message || 'Falha ao concluir cadastro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h5" gutterBottom>
        Cadastro de acesso ao relatório
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Defina sua senha para acessar o relatório de serviços.
        {preview?.email ? ` Conta: ${preview.email}` : ''}
      </Typography>
      {error ? (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      ) : null}
      {preview ? (
        <Box component="form" onSubmit={onSubmit} sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Sobrenome"
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
          <TextField
            label="Senha"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            helperText="Mín. 8 caracteres, 1 maiúscula e 1 especial"
          />
          <TextField
            label="Confirmar senha"
            type="password"
            required
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ bgcolor: '#5a7a5b' }}>
            {busy ? 'Salvando…' : 'Concluir cadastro'}
          </Button>
          <Button onClick={() => navigate(PATHS.professionalServicesReport)}>
            Ir para o relatório
          </Button>
        </Box>
      ) : null}
    </Container>
  );
}
