import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';

const fieldSx = {
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
};

function dateFieldLabel(dateField) {
  return dateField === 'payment_date' ? 'Data do pagamento' : 'Data de criação';
}

export default function OrdersFilters({
  q,
  setQ,
  statusFilter,
  setStatusFilter,
  statusOptions,
  tagFilter,
  setTagFilter,
  tagOptions,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  dateField,
  setDateField,
  onSearch,
  onClearDates,
}) {
  const canClearDates = Boolean(dateFrom || dateTo);

  return (
    <Box
      data-testid="orders-filters"
      sx={{
        width: '100%',
        bgcolor: '#fff',
        border: '1px solid rgba(49, 67, 51, 0.1)',
        borderRadius: 3,
        p: { xs: 2, md: 2.5 },
        mb: 2,
        boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
      }}
    >
      <Stack spacing={3.5}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { md: 160 } }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 2,
                bgcolor: 'rgba(73, 107, 76, 0.1)',
                color: GREEN,
                flex: '0 0 auto',
              }}
            >
              <CalendarMonthRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: GREEN }}>
              {dateFieldLabel(dateField)}
            </Typography>
          </Stack>

          <TextField
            label="Data inicial"
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ ...fieldSx, minWidth: 150 }}
          />
          <TextField
            label="Data final"
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ ...fieldSx, minWidth: 150 }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={onSearch}
            data-testid="orders-search-btn"
            sx={{
              minHeight: 40,
              px: 2.25,
              borderRadius: 2.5,
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: GREEN,
              boxShadow: '0 7px 18px rgba(73, 107, 76, 0.22)',
              '&:hover': { bgcolor: GREEN_HOVER, boxShadow: '0 9px 22px rgba(73, 107, 76, 0.28)' },
            }}
          >
            Buscar
          </Button>
          {canClearDates ? (
            <IconButton
              size="small"
              aria-label="Limpar filtro de datas"
              onClick={onClearDates}
              sx={{
                color: '#8a5a5a',
                bgcolor: 'rgba(180, 70, 70, 0.08)',
                '&:hover': { bgcolor: 'rgba(180, 70, 70, 0.14)' },
              }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          ) : null}
        </Stack>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          <TextField
            size="small"
            placeholder="Pesquisar pedidos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            sx={{ ...fieldSx, minWidth: 220, flex: 1, maxWidth: 360 }}
            data-testid="orders-search"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: '#708172', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            displayEmpty
            size="small"
            sx={{
              minWidth: 180,
              borderRadius: 2.5,
              bgcolor: '#f8faf8',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(49, 67, 51, 0.14)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(73, 107, 76, 0.38)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: GREEN },
            }}
            data-testid="orders-status-select"
          >
            <MenuItem value="">Todos os Status</MenuItem>
            {statusOptions.map((s) => (
              <MenuItem key={s.value || s} value={s.value || s}>
                {s.label || s}
              </MenuItem>
            ))}
          </Select>
          <Autocomplete
            multiple
            size="small"
            options={tagOptions}
            value={tagFilter}
            onChange={(_, newValue) => setTagFilter(newValue)}
            limitTags={2}
            sx={{ minWidth: 220, flex: 1, maxWidth: 320 }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  variant="outlined"
                  label={option}
                  size="small"
                  {...getTagProps({ index })}
                  key={option}
                  sx={{ borderColor: GREEN, color: GREEN, fontWeight: 600 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tags"
                placeholder={tagFilter.length ? '' : 'Todas as tags'}
                sx={fieldSx}
              />
            )}
          />
        </Stack>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Typography variant="body2" sx={{ color: '#657167', fontWeight: 600, mr: 0.5 }}>
            Ordenar:
          </Typography>
          <RadioGroup
            row
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            sx={{
              '& .MuiFormControlLabel-label': { fontSize: '0.875rem', color: '#465348' },
              '& .MuiRadio-root': { color: 'rgba(73, 107, 76, 0.45)' },
              '& .Mui-checked': { color: `${GREEN} !important` },
            }}
          >
            <FormControlLabel
              value="created_date"
              control={<Radio size="small" />}
              label="Data de criação"
            />
            <FormControlLabel
              value="payment_date"
              control={<Radio size="small" />}
              label="Data do pagamento"
            />
          </RadioGroup>
        </Stack>
      </Stack>
    </Box>
  );
}
