import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import EditNoteIcon from '@mui/icons-material/EditNote';
import DescriptionIcon from '@mui/icons-material/Description';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import VerifiedIcon from '@mui/icons-material/Verified';
import BlockIcon from '@mui/icons-material/Block';
import {
  LABEL_ASSOCIADO,
  LABEL_PHASE_1,
  LABEL_PHASE_2,
  LABEL_PHASE_3,
  LABEL_PHASE_4,
  LABEL_PROBLEMA,
  statusLabel,
  statusTooltip,
} from './associatesStatus.js';

const STATUS_VISUAL = {
  [LABEL_PHASE_1]: { color: 'primary', Icon: PendingActionsIcon },
  [LABEL_PHASE_2]: { color: 'primary', Icon: EditNoteIcon },
  [LABEL_PHASE_3]: { color: 'info', Icon: DescriptionIcon },
  [LABEL_PHASE_4]: { color: 'secondary', Icon: DocumentScannerIcon },
  [LABEL_ASSOCIADO]: { color: 'success', Icon: VerifiedIcon },
  [LABEL_PROBLEMA]: { color: 'error', Icon: BlockIcon },
};

export default function AssociateStatusChip({ user }) {
  const label = statusLabel(user);
  const title = statusTooltip(user);
  const visual = STATUS_VISUAL[label] || { color: 'default', Icon: null };
  const Icon = visual.Icon;

  return (
    <Tooltip
      title={title}
      arrow
      enterDelay={300}
      slotProps={{
        tooltip: {
          sx: {
            fontSize: '0.875rem',
            lineHeight: 1.4,
            maxWidth: 320,
            py: 1,
            px: 1.25,
          },
        },
      }}
    >
      <Chip
        size="small"
        variant="filled"
        color={visual.color}
        label={label}
        icon={Icon ? <Icon sx={{ fontSize: 16 }} /> : undefined}
        sx={{
          fontWeight: 500,
          maxWidth: '100%',
          '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
        }}
      />
    </Tooltip>
  );
}
