import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { FILTER_OPTIONS } from './institutionalStatus.js';

const GREEN = '#496b4c';
const PURPLE = '#705372';

export default function InstitutionalFilters({
  shownCount = 0,
  totalCount = null,
  filter,
  onFilterChange,
  onReload,
  onCreate,
  localQ,
  onLocalQ,
}) {
  const [anchor, setAnchor] = useState(null);
  const filterActive = Boolean(filter);
  const activeFilterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label;

  const countLabel = useMemo(() => {
    const shown = Number(shownCount) || 0;
    const total = totalCount != null ? Number(totalCount) : null;
    if (shown === 0) return 'Nenhum cadastro encontrado';
    if (total != null && total !== shown) {
      return `Exibindo ${shown} de ${total} cadastro${total === 1 ? '' : 's'}`;
    }
    return `Exibindo ${shown} cadastro${shown === 1 ? '' : 's'}`;
  }, [shownCount, totalCount]);

  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: '1px solid rgba(49, 67, 51, 0.1)',
        borderRadius: 3,
        p: { xs: 2, md: 2.5 },
        mb: 2,
        boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Box sx={{ flex: 1, maxWidth: 560 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Nome, documento, e-mail ou telefone"
            value={localQ}
            onChange={(e) => onLocalQ(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                bgcolor: '#f8faf8',
                transition: 'background-color 160ms ease, box-shadow 160ms ease',
                '& fieldset': { borderColor: 'rgba(49, 67, 51, 0.14)' },
                '&:hover fieldset': { borderColor: 'rgba(73, 107, 76, 0.38)' },
                '&.Mui-focused': {
                  bgcolor: '#fff',
                  boxShadow: '0 0 0 3px rgba(73, 107, 76, 0.1)',
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
        >
          <Button
            variant={filterActive ? 'contained' : 'outlined'}
            startIcon={<FilterAltIcon />}
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{
              borderRadius: 2.5,
              borderColor: 'rgba(112, 83, 114, 0.3)',
              bgcolor: filterActive ? PURPLE : 'transparent',
              color: filterActive ? '#fff' : PURPLE,
              textTransform: 'none',
              fontWeight: 700,
              '&:hover': {
                bgcolor: filterActive ? '#5e4460' : 'rgba(112, 83, 114, 0.06)',
                borderColor: PURPLE,
              },
            }}
          >
            {filterActive ? 'Filtro ativo' : 'Filtrar'}
          </Button>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 220,
                borderRadius: 2.5,
                boxShadow: '0 16px 40px rgba(31, 44, 33, 0.16)',
              },
            }}
          >
            <MenuItem
              selected={!filter}
              onClick={() => {
                onFilterChange('');
                setAnchor(null);
              }}
            >
              Todos
            </MenuItem>
            {FILTER_OPTIONS.map((o) => (
              <MenuItem
                key={o.value}
                selected={filter === o.value}
                onClick={() => {
                  onFilterChange(o.value);
                  setAnchor(null);
                }}
              >
                {o.label}
              </MenuItem>
            ))}
          </Menu>
          <Tooltip title="Atualizar lista">
            <IconButton
              onClick={onReload}
              sx={{
                color: '#526354',
                border: '1px solid rgba(49, 67, 51, 0.14)',
                borderRadius: 2.5,
                '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
              }}
            >
              <RefreshRoundedIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<BusinessOutlinedIcon />}
            onClick={onCreate}
            sx={{
              bgcolor: GREEN,
              borderRadius: 2.5,
              px: 2,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: '0 7px 18px rgba(73, 107, 76, 0.22)',
              '&:hover': { bgcolor: '#385a3c', boxShadow: '0 9px 22px rgba(73, 107, 76, 0.28)' },
            }}
          >
            Novo cliente
          </Button>
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        sx={{ mt: 2 }}
      >
        <Typography variant="body2" sx={{ color: '#657167' }}>
          {countLabel}
        </Typography>
        {activeFilterLabel ? (
          <Chip
            size="small"
            label={activeFilterLabel}
            onDelete={() => onFilterChange('')}
            sx={{
              bgcolor: 'rgba(112, 83, 114, 0.1)',
              color: '#5e4460',
              fontWeight: 600,
              '& .MuiChip-deleteIcon': { color: '#705372' },
            }}
          />
        ) : null}
      </Stack>
    </Box>
  );
}
