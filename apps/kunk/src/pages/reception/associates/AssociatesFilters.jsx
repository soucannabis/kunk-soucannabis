import React, { useState } from 'react';
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
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { FILTER_OPTIONS } from './associatesStatus.js';

const GREEN = '#496b4c';
const PURPLE = '#705372';

export const PAGE_SIZE_OPTIONS = [30, 50, 100, 250];

export default function AssociatesFilters({
  filter,
  onFilterChange,
  searchInput,
  onSearchInputChange,
  onSearch,
  onReload,
  onCreate,
  page,
  pageSize,
  totalCount,
}) {
  const [anchor, setAnchor] = useState(null);
  const filterActive = Boolean(filter);
  const total = Number(totalCount) || 0;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.value === filter)?.label;

  function submitSearch(e) {
    e?.preventDefault?.();
    onSearch?.();
  }

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
        <Box
          component="form"
          onSubmit={submitSearch}
          sx={{ flex: 1, maxWidth: 560 }}
        >
          <TextField
            size="small"
            fullWidth
            placeholder="Nome, e-mail ou telefone"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
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
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    type="submit"
                    size="small"
                    sx={{ color: GREEN, minWidth: 0, fontWeight: 700, textTransform: 'none' }}
                  >
                    Buscar
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', sm: 'flex-end' }}>
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
                minWidth: 260,
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
            startIcon={<PersonAddAltRoundedIcon />}
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
            Novo associado
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
          {total === 0
            ? 'Nenhum cadastro encontrado'
            : `Exibindo ${from}–${to} de ${total} cadastro${total === 1 ? '' : 's'}`}
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
