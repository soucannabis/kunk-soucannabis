import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  CIAP2_OPTIONS,
  normalizeCiapCodes,
  resolveCiapCodes,
} from '@kunk/forms';

const GREEN = '#5a7a5b';

/**
 * CIAP-2 field (MUI) — UX do UserModal legado: chips + Adicionar CIAP + busca + categorias.
 */
export default function Ciap2Field({ value, onChange, max = 10, disabled = false }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openCat, setOpenCat] = useState(false);

  const selected = normalizeCiapCodes(value);
  const selectedItems = useMemo(() => resolveCiapCodes(selected), [selected]);

  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return CIAP2_OPTIONS.map((cat) => ({
      ...cat,
      subcategories: (cat.subcategories || []).filter((sub) => {
        if (!term) return true;
        return (
          String(sub.label || '').toLowerCase().includes(term) ||
          String(sub.value || '').toLowerCase().includes(term)
        );
      }),
    })).filter((cat) => cat.subcategories.length > 0);
  }, [searchTerm]);

  function addCode(code) {
    if (disabled || selected.includes(code) || selected.length >= max) return;
    onChange([...selected, code]);
  }

  function removeCode(code) {
    if (disabled) return;
    onChange(selected.filter((c) => c !== code));
  }

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Motivo do tratamento (CIAP2)
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mb: 1 }}>
        {selectedItems.map((item) => (
          <Chip
            key={item.value}
            color="primary"
            size="small"
            title={item.category || undefined}
            label={`${item.value} - ${item.label}`}
            onDelete={disabled ? undefined : () => removeCode(item.value)}
            sx={{ m: '2px' }}
          />
        ))}
        {!disabled && selected.length < max && !pickerOpen ? (
          <Chip
            color="success"
            size="small"
            icon={<AddCircleOutlineIcon />}
            label="Adicionar CIAP"
            onClick={() => setPickerOpen(true)}
            sx={{ m: '2px', bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
          />
        ) : null}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {selected.length}/{max}
      </Typography>
      {pickerOpen ? (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Pesquise pelo motivo do tratamento:
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Motivo do tratamento"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOpenCat('all');
            }}
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" align="center" gutterBottom>
            Selecione as opções abaixo
          </Typography>
          <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
            {filteredCategories.map((cat, index) => (
              <Accordion
                key={cat.category}
                disableGutters
                expanded={openCat === `options${index}` || openCat === 'all' || Boolean(searchTerm.trim())}
                onChange={() =>
                  setOpenCat((prev) => (prev === `options${index}` ? false : `options${index}`))
                }
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>{cat.category}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box display="flex" flexDirection="column">
                    {cat.subcategories.map((sub) => (
                      <FormControlLabel
                        key={sub.value}
                        control={
                          <Checkbox
                            size="small"
                            checked={selected.includes(sub.value)}
                            disabled={!selected.includes(sub.value) && selected.length >= max}
                            onChange={() => {
                              if (selected.includes(sub.value)) removeCode(sub.value);
                              else addCode(sub.value);
                            }}
                          />
                        }
                        label={`${sub.value} — ${sub.label}`}
                      />
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
          <Chip
            label="Fechar seletor"
            size="small"
            onClick={() => setPickerOpen(false)}
            sx={{ mt: 1.5 }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
