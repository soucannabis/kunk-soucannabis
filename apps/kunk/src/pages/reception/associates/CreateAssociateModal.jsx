import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { contentAreaDialogProps } from './associatesStatus.js';

const GREEN = '#5a7a5b';

export default function CreateAssociateModal({ open, onClose, onCreated, api }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await api.createUser({ email_account: email.trim() });
      onCreated?.(res.data);
      setEmail('');
      onClose();
    } catch (err) {
      const code = err?.code || err?.body?.error?.code;
      if (code === 'ACCOUNT_EXISTS' || code === 'ACCOUNT_IN_PROGRESS') {
        const userCode = err?.details?.user_code || err?.body?.error?.details?.user_code;
        onCreated?.({ __existing: true, user_code: userCode, code });
        onClose();
        return;
      }
      setError(err.message || 'Falha ao criar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>Criar Associado</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mt: 1 }}
        />
        {error ? (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={busy || !email.includes('@')}
          onClick={submit}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
        >
          Criar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
