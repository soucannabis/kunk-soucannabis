import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import FileUpload from '../files/FileUpload.jsx';
import { contentAreaDialogProps } from '../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';
const GREEN_HOVER = '#303B30';

function toDateInput(value) {
  if (!value) return '';
  const s = String(value);
  return s.length >= 10 ? s.substring(0, 10) : s;
}

/**
 * Edita date_prescription + arquivos de receita (kind=prescription → prefixo receita-).
 */
export default function DatePrescriptionEdit({ user, api, onDateSaved }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => toDateInput(user?.date_prescription));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDate(toDateInput(user?.date_prescription));
  }, [user, open]);

  const handleOpen = () => {
    setError('');
    setOpen(true);
  };
  const handleClose = () => {
    if (!loading) setOpen(false);
  };

  async function persist(nextDate) {
    if (!user?.id || !api) return;
    setLoading(true);
    setError('');
    try {
      await api.updateItem('users', user.id, { date_prescription: nextDate || null });
      if (onDateSaved) onDateSaved(nextDate || '');
      handleClose();
    } catch (err) {
      setError(err.message || 'Erro ao atualizar data da prescrição.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<CalendarMonthIcon />}
        sx={{ backgroundColor: GREEN, color: 'white', '&:hover': { bgcolor: GREEN_HOVER } }}
        onClick={handleOpen}
        data-testid="edit-prescription"
      >
        Editar Prescrição
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { minWidth: 350 } }}
        {...contentAreaDialogProps}
      >
        <DialogTitle>Data da Prescrição</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <TextField
              label="Data da Prescrição"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              sx={{ mt: 2, width: 200 }}
              data-testid="prescription-date-input"
            />
            {date && (
              <IconButton
                aria-label="Limpar data"
                onClick={() => persist(null)}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                <CloseIcon color="error" />
              </IconButton>
            )}
          </div>
          {user?.id && api && (
            <FileUpload api={api} user={user} kind="prescription" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => persist(date)}
            disabled={loading || !date}
            sx={{ backgroundColor: GREEN, color: 'white', '&:hover': { bgcolor: GREEN_HOVER } }}
            data-testid="prescription-save"
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
