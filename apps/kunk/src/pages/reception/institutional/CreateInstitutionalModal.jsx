import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { contentAreaDialogProps } from './institutionalStatus.js';
import PhoneField from '../../../components/PhoneField.jsx';
import { isValidPhoneBr } from '@kunk/forms';

const GREEN = '#5a7a5b';

const EMPTY = {
  is_company: false,
  company_name: '',
  company_trade_name: '',
  company_cnpj: '',
  company_email: '',
  company_phone: '',
  representative_name: '',
  representative_last_name: '',
  representative_cpf: '',
  representative_email: '',
  representative_mobile: '',
  street: '',
  street_number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  cep: '',
};

export default function CreateInstitutionalModal({ open, onClose, onCreated, api }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(EMPTY);
    setError('');
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        is_company: Boolean(form.is_company),
        status: 'active',
      };
      if (!payload.is_company) {
        payload.company_name = null;
        payload.company_trade_name = null;
        payload.company_cnpj = null;
        payload.company_email = null;
        payload.company_phone = null;
      }
      const res = await api.createInstitutionalClient(payload);
      onCreated?.(res.data);
      reset();
      onClose();
    } catch (err) {
      setError(err.message || 'Falha ao criar');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    form.representative_name.trim() &&
    form.representative_cpf.replace(/\D/g, '').length === 11 &&
    isValidPhoneBr(form.representative_mobile) &&
    (form.representative_email.includes('@') ||
      (form.is_company && form.company_email.includes('@'))) &&
    form.street.trim() &&
    form.cep.replace(/\D/g, '').length === 8 &&
    (!form.is_company ||
      (form.company_name.trim() && form.company_cnpj.replace(/\D/g, '').length === 14));

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      maxWidth="md"
      fullWidth
      {...contentAreaDialogProps}
    >
      <DialogTitle>Criar Cliente Institucional</DialogTitle>
      <DialogContent>
        <FormControlLabel
          sx={{ mt: 1, mb: 2 }}
          control={
            <Switch
              checked={Boolean(form.is_company)}
              onChange={(e) => setField('is_company', e.target.checked)}
              color="success"
            />
          }
          label="É uma empresa?"
        />

        {form.is_company ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: GREEN }}>
              Dados da empresa
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Razão social"
                  value={form.company_name}
                  onChange={(e) => setField('company_name', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nome fantasia"
                  value={form.company_trade_name}
                  onChange={(e) => setField('company_trade_name', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  required
                  label="CNPJ"
                  value={form.company_cnpj}
                  onChange={(e) => setField('company_cnpj', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="E-mail da empresa"
                  value={form.company_email}
                  onChange={(e) => setField('company_email', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <PhoneField
                  label="Telefone da empresa"
                  name="company_phone"
                  value={form.company_phone}
                  onChange={(v) => setField('company_phone', v)}
                />
              </Grid>
            </Grid>
          </Box>
        ) : null}

        <Typography variant="subtitle2" sx={{ mb: 1, color: GREEN }}>
          Representante (obrigatório)
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              autoFocus={!form.is_company}
              label="Nome"
              value={form.representative_name}
              onChange={(e) => setField('representative_name', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Sobrenome"
              value={form.representative_last_name}
              onChange={(e) => setField('representative_last_name', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              required
              label="CPF"
              value={form.representative_cpf}
              onChange={(e) => setField('representative_cpf', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              required={!form.is_company || !form.company_email}
              label="E-mail"
              value={form.representative_email}
              onChange={(e) => setField('representative_email', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <PhoneField
              label="Celular"
              name="representative_mobile"
              value={form.representative_mobile}
              onChange={(v) => setField('representative_mobile', v)}
              required
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: GREEN }}>
          Endereço de entrega
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              required
              label="Rua"
              value={form.street}
              onChange={(e) => setField('street', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Número"
              value={form.street_number}
              onChange={(e) => setField('street_number', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Complemento"
              value={form.complement}
              onChange={(e) => setField('complement', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Bairro"
              value={form.neighborhood}
              onChange={(e) => setField('neighborhood', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              required
              label="CEP"
              value={form.cep}
              onChange={(e) => setField('cep', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              label="Cidade"
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="UF"
              value={form.state}
              onChange={(e) => setField('state', e.target.value)}
              inputProps={{ maxLength: 2 }}
            />
          </Grid>
        </Grid>

        {error ? (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {error}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={busy || !canSubmit}
          onClick={submit}
          sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
        >
          Criar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
