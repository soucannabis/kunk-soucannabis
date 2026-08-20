import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { contentAreaDialogProps } from '../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';
const GREEN_HOVER = '#303B30';

function formatPhoneNumber(phone) {
  if (!phone) return '—';
  const cleaned = String(phone).replace(/\D/g, '');
  const match = cleaned.match(/^55(\d{2})(\d{5})(\d{4})$/) || cleaned.match(/^(\d{2})(\d{5})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return phone;
}

function emptyAddress() {
  return {
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: '',
  };
}

function officialFromUser(user) {
  return {
    street: user?.street || user?.address?.street || '',
    number: user?.street_number || user?.number || user?.address?.number || '',
    complement: user?.complement || user?.address?.complement || '',
    neighborhood: user?.neighborhood || user?.address?.neighborhood || '',
    city: user?.city || user?.address?.city || '',
    state: user?.state || user?.address?.state || '',
    cep: user?.cep || user?.postal_code || user?.address?.cep || '',
  };
}

function deliveryFromUser(user) {
  const src = user?.delivery_address || user?.address_delivery;
  if (src && typeof src === 'object') {
    return {
      street: src.street || '',
      number: src.number || src.street_number || '',
      complement: src.complement || '',
      neighborhood: src.neighborhood || '',
      city: src.city || '',
      state: src.state || '',
      cep: src.cep || src.postal_code || '',
    };
  }
  return emptyAddress();
}

function displayName(user) {
  if (!user) return '';
  return (
    [user.associate_name || user.name || user.first_name, user.associate_last_name || user.last_name || user.lastname_associate]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    user.email_account ||
    ''
  );
}

/**
 * Edita endereço oficial (cadastro) e endereço de entrega do associado.
 * Persiste via PATCH /items/users/:id — campos OSS: street_number + delivery_address.
 */
export default function AddressEditDialog({ open, onClose, user, api, onSaved }) {
  const [formOfficial, setFormOfficial] = useState(() => officialFromUser(user));
  const [formDelivery, setFormDelivery] = useState(() => deliveryFromUser(user));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormOfficial(officialFromUser(user));
    setFormDelivery(deliveryFromUser(user));
    setError('');
  }, [user, open]);

  const handleChangeOfficial = (e) => {
    setFormOfficial((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleChangeDelivery = (e) => {
    setFormDelivery((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  async function handleSave() {
    if (!user?.id || !api) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        street: formOfficial.street,
        street_number: formOfficial.number,
        complement: formOfficial.complement,
        neighborhood: formOfficial.neighborhood,
        city: formOfficial.city,
        state: formOfficial.state,
        cep: formOfficial.cep,
        delivery_address: { ...formDelivery },
      };
      await api.updateItem('users', user.id, payload);
      if (onSaved) {
        onSaved({
          official: { ...formOfficial },
          delivery: { ...formDelivery },
        });
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao salvar endereço.');
    } finally {
      setLoading(false);
    }
  }

  const officialPreview = `${user?.street || ''}, ${user?.street_number || user?.number || ''}${
    user?.complement ? ` - ${user.complement}` : ''
  } — ${user?.neighborhood || ''}, ${user?.city || ''} - ${user?.state || ''}, ${user?.cep || ''}`;

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>Dados do Associado</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body1">
          <strong>Nome:</strong> {displayName(user)}
        </Typography>
        <Typography variant="body1">
          <strong>Email:</strong> {user?.email_account || '—'}
        </Typography>
        <Typography variant="body1">
          <strong>Telefone:</strong> {formatPhoneNumber(user?.mobile_number)}
        </Typography>
        <Typography variant="body1" sx={{ mb: 1 }}>
          <strong>Endereço de cadastro:</strong>
          <br />
          {officialPreview}
        </Typography>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Endereço Oficial (Cadastro)
        </Typography>
        <TextField label="Rua" name="street" value={formOfficial.street} onChange={handleChangeOfficial} fullWidth />
        <TextField
          margin="dense"
          label="Número"
          name="number"
          value={formOfficial.number}
          onChange={handleChangeOfficial}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Complemento"
          name="complement"
          value={formOfficial.complement}
          onChange={handleChangeOfficial}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Bairro"
          name="neighborhood"
          value={formOfficial.neighborhood}
          onChange={handleChangeOfficial}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Cidade"
          name="city"
          value={formOfficial.city}
          onChange={handleChangeOfficial}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Estado"
          name="state"
          value={formOfficial.state}
          onChange={handleChangeOfficial}
          fullWidth
        />
        <TextField
          margin="dense"
          label="CEP"
          name="cep"
          value={formOfficial.cep}
          onChange={handleChangeOfficial}
          fullWidth
        />

        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
          Endereço de Entrega (Pedido)
        </Typography>
        <TextField label="Rua" name="street" value={formDelivery.street} onChange={handleChangeDelivery} fullWidth />
        <TextField
          margin="dense"
          label="Número"
          name="number"
          value={formDelivery.number}
          onChange={handleChangeDelivery}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Complemento"
          name="complement"
          value={formDelivery.complement}
          onChange={handleChangeDelivery}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Bairro"
          name="neighborhood"
          value={formDelivery.neighborhood}
          onChange={handleChangeDelivery}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Cidade"
          name="city"
          value={formDelivery.city}
          onChange={handleChangeDelivery}
          fullWidth
        />
        <TextField
          margin="dense"
          label="Estado"
          name="state"
          value={formDelivery.state}
          onChange={handleChangeDelivery}
          fullWidth
        />
        <TextField
          margin="dense"
          label="CEP"
          name="cep"
          value={formDelivery.cep}
          onChange={handleChangeDelivery}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
