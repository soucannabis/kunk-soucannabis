import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';

import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { contentAreaDialogProps } from '../../../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';
const GREEN_HOVER = '#48624a';
const PURPLE = '#7A5B7A';
const PURPLE_HOVER = '#4d2d4d';

export default function OrdersBulkActions({
  selectedCount,
  statusOptions,
  labelFlags,
  onBulkStatus,
  onBulkTags,
  onBulkLabel,
  onProductionReport,
  onShowOnlySelected,
}) {
  const [anchor, setAnchor] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagMode, setTagMode] = useState('add');
  const [tagText, setTagText] = useState('');

  if (!selectedCount) return null;

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <Button
        variant="contained"
        startIcon={<PlaylistAddCheckIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ bgcolor: PURPLE, '&:hover': { bgcolor: PURPLE_HOVER } }}
        data-testid="bulk-actions"
      >
        Ação em massa ({selectedCount})
      </Button>
      <Button
        variant="contained"
        startIcon={<PictureAsPdfOutlinedIcon />}
        onClick={() => onProductionReport?.()}
        sx={{ bgcolor: GREEN, '&:hover': { bgcolor: GREEN_HOVER } }}
        data-testid="production-report"
      >
        Relatório de produção ({selectedCount})
      </Button>
      <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setStatusOpen(true);
          }}
        >
          Alterar status…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setTagMode('add');
            setTagsOpen(true);
          }}
        >
          Adicionar tags…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setTagMode('remove');
            setTagsOpen(true);
          }}
        >
          Remover tags…
        </MenuItem>
        {labelFlags.loggi && (
          <>
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onBulkLabel('loggi', 'create');
              }}
            >
              Gerar etiquetas Loggi
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onBulkLabel('loggi', 'cancel');
              }}
            >
              Cancelar etiquetas Loggi
            </MenuItem>
          </>
        )}
        {labelFlags.melhorenvio && (
          <>
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onBulkLabel('melhorenvio', 'create');
              }}
            >
              Gerar etiquetas Melhor Envio
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchor(null);
                onBulkLabel('melhorenvio', 'cancel');
              }}
            >
              Cancelar etiquetas Melhor Envio
            </MenuItem>
          </>
        )}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onShowOnlySelected();
          }}
        >
          Mostrar apenas selecionados
        </MenuItem>
      </Menu>

      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} {...contentAreaDialogProps}>
        <DialogTitle>Alterar status</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1, minWidth: 280 }}>
            {statusOptions.map((s) => (
              <Button
                key={s.value}
                variant="outlined"
                onClick={() => {
                  setStatusOpen(false);
                  onBulkStatus(s.value);
                }}
              >
                {s.label}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={tagsOpen} onClose={() => setTagsOpen(false)} {...contentAreaDialogProps}>
        <DialogTitle>{tagMode === 'add' ? 'Adicionar tags' : 'Remover tags'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Tags (separadas por vírgula)"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagsOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            sx={{ bgcolor: GREEN }}
            onClick={() => {
              const tags = tagText
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              setTagsOpen(false);
              setTagText('');
              onBulkTags(tagMode, tags);
            }}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function OrdersBulkResultDialog({ open, onClose, title, results }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth {...contentAreaDialogProps}>
      <DialogTitle>{title || 'Resultado'}</DialogTitle>
      <DialogContent>
        <Box component="ul" sx={{ pl: 2 }}>
          {(results || []).map((r) => (
            <li key={r.order_id}>
              #{r.order_id}: {r.ok ? 'OK' : r.error || 'falha'}
            </li>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
