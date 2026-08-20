import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  ASSOCIATE_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
  RECEPTION_STATUS_OPTIONS,
  SERVICE_STATUS_OPTIONS,
} from './analyticsLayout.js';
import { formatKpiValue } from './analyticsPeriod.js';
import { AnalyticsBarChart, AnalyticsLineChart, AnalyticsPieChart } from './charts/AnalyticsCharts.jsx';

const GREEN = '#496b4c';

function statusOptionsForTab(tabId) {
  if (tabId === 'associates') return ASSOCIATE_STATUS_OPTIONS;
  if (tabId === 'services') return SERVICE_STATUS_OPTIONS;
  if (tabId === 'orders') return ORDER_STATUS_OPTIONS;
  if (tabId === 'reception') return RECEPTION_STATUS_OPTIONS;
  return [];
}

function RankingTable({ rows }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        Sem dados no período
      </Typography>
    );
  }
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, maxHeight: 280, overflow: 'auto' }}>
      {list.map((row, i) => (
        <Box
          component="li"
          key={`${row.name}-${i}`}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
            py: 0.75,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography variant="body2">{row.name}</Typography>
          <Typography variant="body2" fontWeight={600}>
            {Number(row.value || 0).toLocaleString('pt-BR')}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function AnalyticsBlock({
  def,
  tabId,
  filters,
  globalPeriod,
  data,
  loading,
  error,
  onChangeFilters,
}) {
  const [openFilters, setOpenFilters] = useState(false);
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const layout = def.layout || { xs: 12, md: 6 };
  const dateDiverges = filters?.start !== globalPeriod?.start || filters?.end !== globalPeriod?.end;
  const hasExtra =
    (filters?.status || []).length > 0 || (filters?.tags || []).length > 0;
  const statusOpts = statusOptionsForTab(tabId);
  const fields = def.filterFields || [];

  let body = null;
  if (loading) {
    body = (
      <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} sx={{ color: GREEN }} />
      </Box>
    );
  } else if (error) {
    body = (
      <Typography variant="body2" color="error" sx={{ py: 2 }}>
        {error}
      </Typography>
    );
  } else if (def.type === 'kpi') {
    const raw = data?.kpis?.[def.kpiKey];
    body = (
      <Typography variant="h4" sx={{ fontWeight: 700, color: '#2f3b2f', py: 1 }}>
        {formatKpiValue(raw, def.kpiFormat)}
      </Typography>
    );
  } else if (def.type === 'chart') {
    const series = data?.series?.[def.seriesKey] || [];
    if (def.chartVariant === 'line') body = <AnalyticsLineChart data={series} />;
    else if (def.chartVariant === 'pie') body = <AnalyticsPieChart data={series} />;
    else {
      const vertical = series.length > 8 || def.seriesKey === 'by_professional' || def.seriesKey === 'by_attendant';
      body = <AnalyticsBarChart data={series} layout={vertical ? 'vertical' : 'horizontal'} />;
    }
  } else if (def.type === 'ranking') {
    body = <RankingTable rows={data?.rankings?.[def.rankingKey]} />;
  }

  return (
    <Grid item xs={layout.xs || 12} sm={layout.sm} md={layout.md || 6}>
      <Box
        sx={{
          height: '100%',
          p: 2,
          bgcolor: '#fff',
          borderRadius: 2,
          border: '1px solid #e6ebe6',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {def.title}
            </Typography>
            {(dateDiverges || hasExtra) && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                {dateDiverges && <Chip size="small" label="Data própria" variant="outlined" />}
                {hasExtra && <Chip size="small" label="Filtros locais" color="secondary" variant="outlined" />}
              </Stack>
            )}
          </Box>
          <IconButton size="small" onClick={() => setOpenFilters((v) => !v)} aria-label="Filtros do bloco">
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Collapse in={openFilters}>
          <Stack spacing={1.25} sx={{ mb: 2, p: 1.5, bgcolor: '#f7f9f7', borderRadius: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                size="small"
                type="date"
                label="De"
                InputLabelProps={{ shrink: true }}
                value={draft?.start || ''}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Até"
                InputLabelProps={{ shrink: true }}
                value={draft?.end || ''}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                fullWidth
              />
            </Stack>
            {fields.includes('status') && (
              <TextField
                select
                size="small"
                label="Status"
                value={draft?.status?.[0] || ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    status: e.target.value ? [e.target.value] : [],
                  }))
                }
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                {statusOpts.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {fields.includes('tags') && (
              <TextField
                size="small"
                label="Tags (separadas por vírgula)"
                value={draft?.tagsText != null ? draft.tagsText : (draft?.tags || []).join(', ')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    tagsText: e.target.value,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }))
                }
                fullWidth
              />
            )}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                onClick={() => {
                  const { tagsText, ...rest } = draft || {};
                  onChangeFilters(rest);
                }}
                sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#4a6a4b' }, textTransform: 'none' }}
              >
                Aplicar
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const reset = {
                    ...draft,
                    start: globalPeriod.start,
                    end: globalPeriod.end,
                    status: [],
                    tags: [],
                  };
                  setDraft(reset);
                  onChangeFilters(reset);
                }}
                sx={{ textTransform: 'none' }}
              >
                Restaurar global
              </Button>
            </Stack>
          </Stack>
        </Collapse>

        {body}
      </Box>
    </Grid>
  );
}
