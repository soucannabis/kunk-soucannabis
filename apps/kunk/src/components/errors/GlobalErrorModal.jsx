import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { CONTENT_AREA_DIALOG_Z } from '../../layout/contentAreaOverlay.js';

/**
 * Modal de erro do sistema (controlado pelo ErrorModalProvider).
 */
export default function GlobalErrorModal({ open, title = 'Erro', message = '', onClose }) {
  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="global-error-modal"
      aria-labelledby="global-error-title"
      aria-describedby="global-error-message"
      sx={{ zIndex: CONTENT_AREA_DIALOG_Z + 100 }}
    >
      <DialogTitle
        id="global-error-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          color: 'error.main',
          fontWeight: 700,
        }}
      >
        <ErrorOutlineIcon color="error" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography
          id="global-error-message"
          data-testid="global-error-message"
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'text.primary',
            lineHeight: 1.5,
          }}
        >
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" color="error" onClick={onClose} autoFocus>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
