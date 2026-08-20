import React from 'react';
import { Box, Typography } from '@mui/material';
import { PhoneInput } from '@kunk/forms';
import { CONTENT_AREA_OVERLAY_Z } from '../layout/contentAreaOverlay.js';

const GREEN = '#5a7a5b';

const phoneBoxSx = {
  width: '100%',
  '& .kunk-phone-input': { width: '100%' },
  '& .kunk-phone-input .form-control': {
    width: '100% !important',
    height: '40px !important',
    fontSize: '0.875rem',
    borderRadius: '4px',
    border: '1px solid rgba(0, 0, 0, 0.23)',
    paddingLeft: '48px',
  },
  '& .kunk-phone-input .form-control:focus': {
    borderColor: GREEN,
    outline: 'none',
    boxShadow: `0 0 0 1px ${GREEN}`,
  },
  '& .kunk-phone-flag-btn': {
    borderRadius: '4px 0 0 4px',
    border: '1px solid rgba(0, 0, 0, 0.23)',
    background: '#fff',
  },
  '& .kunk-phone-dropdown': {
    zIndex: CONTENT_AREA_OVERLAY_Z,
  },
};

/**
 * Telefone padrão (mesmo do /contato): DDI + número, valor em dígitos com código do país.
 */
export default function PhoneField({
  label,
  value,
  onChange,
  name = 'phone',
  required = false,
  invalid = false,
  size = 'small',
}) {
  const height = size === 'small' ? '40px' : '56px';
  return (
    <Box sx={{ ...phoneBoxSx, '& .kunk-phone-input .form-control': { ...phoneBoxSx['& .kunk-phone-input .form-control'], height: `${height} !important` } }}>
      {label ? (
        <Typography
          component="label"
          variant="caption"
          sx={{ display: 'block', mb: 0.5, color: 'rgba(0,0,0,0.6)' }}
        >
          {label}
          {required ? ' *' : ''}
        </Typography>
      ) : null}
      <PhoneInput
        value={value || ''}
        onChange={onChange}
        invalid={invalid}
        inputProps={{
          name,
          autoComplete: 'tel',
          'aria-label': label || name,
          required,
        }}
      />
    </Box>
  );
}
