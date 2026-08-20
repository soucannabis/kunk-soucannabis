import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import AnalyticsGlobalFilters from './AnalyticsGlobalFilters.jsx';
import AnalyticsBlock from './AnalyticsBlock.jsx';
import {
  ANALYTICS_TABS,
  allBlockIds,
  blocksForTab,
} from './analyticsLayout.js';
import {
  buildAnalyticsQuery,
  defaultGlobalPeriod,
  emptyBlockFilter,
  filterHash,
  groupByFromPreset,
  periodFromPreset,
  syncDatesToBlocks,
} from './analyticsPeriod.js';

const materialTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});

const GREEN = '#496b4c';

const paperSx = {
  bgcolor: '#fff',
  border: '1px solid rgba(49, 67, 51, 0.1)',
  borderRadius: 3,
  boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
};

function initBlockFilters(period) {
  const map = {};
  for (const id of allBlockIds()) {
    map[id] = emptyBlockFilter(period);
  }
  return map;
}

function fetchForTab(api, tabId, qs) {
  if (tabId === 'associates') return api.getAnalyticsAssociates(qs);
  if (tabId === 'services') return api.getAnalyticsServices(qs);
  if (tabId === 'orders') return api.getAnalyticsOrders(qs);
  return api.getAnalyticsReception(qs);
}

export default function AnalyticsDashboardPage() {
  const { showError } = useErrorModal();
  const bootstrap = useMemo(() => getKunkPublicConfig(), []);
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const [tab, setTab] = useState('associates');
  const [globalPeriod, setGlobalPeriod] = useState(() => defaultGlobalPeriod());
  const [draftPeriod, setDraftPeriod] = useState(() => defaultGlobalPeriod());
  const [blockFilters, setBlockFilters] = useState(() => initBlockFilters(defaultGlobalPeriod()));
  /** cache: `${tabId}::${hash}` -> { data, loading, error } */
  const [cache, setCache] = useState({});
  const reqSeq = useRef(0);

  const groupBy = groupByFromPreset(globalPeriod.preset);
  const blocks = blocksForTab(tab);

  const neededHashes = useMemo(() => {
    const set = new Set();
    for (const b of blocks) {
      set.add(filterHash(blockFilters[b.id], groupBy));
    }
    return [...set];
  }, [blocks, blockFilters, groupBy]);

  const loadHashes = useCallback(
    async (tabId, hashes, filtersByHash) => {
      const seq = ++reqSeq.current;
      setCache((prev) => {
        const next = { ...prev };
        for (const h of hashes) {
          const key = `${tabId}::${h}`;
          next[key] = { ...(next[key] || {}), loading: true, error: null };
        }
        return next;
      });

      await Promise.all(
        hashes.map(async (h) => {
          const filters = filtersByHash[h];
          const qs = buildAnalyticsQuery(filters, groupBy);
          try {
            const res = await fetchForTab(api, tabId, qs);
            if (seq !== reqSeq.current) return;
            setCache((prev) => ({
              ...prev,
              [`${tabId}::${h}`]: { data: res.data, loading: false, error: null },
            }));
          } catch (err) {
            if (seq !== reqSeq.current) return;
            showError(err);
            setCache((prev) => ({
              ...prev,
              [`${tabId}::${h}`]: {
                data: null,
                loading: false,
                error: err?.message || 'Falha ao carregar analytics',
              },
            }));
          }
        })
      );
    },
    [api, groupBy, showError]
  );

  useEffect(() => {
    const filtersByHash = {};
    for (const b of blocks) {
      const h = filterHash(blockFilters[b.id], groupBy);
      if (!filtersByHash[h]) filtersByHash[h] = blockFilters[b.id];
    }
    loadHashes(tab, neededHashes, filtersByHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: refetch on filter/tab change
  }, [tab, neededHashes.join('|'), groupBy]);

  function applyGlobal() {
    const next = {
      ...draftPeriod,
      preset: draftPeriod.preset || 'month',
    };
    setGlobalPeriod(next);
    setBlockFilters((prev) => syncDatesToBlocks(prev, next));
  }

  function onPreset(presetId) {
    const next = periodFromPreset(presetId);
    setDraftPeriod(next);
    setGlobalPeriod(next);
    setBlockFilters((prev) => syncDatesToBlocks(prev, next));
  }

  function onChangeBlockFilters(blockId, nextFilters) {
    setBlockFilters((prev) => ({ ...prev, [blockId]: nextFilters }));
  }

  const anyLoading = neededHashes.some((h) => cache[`${tab}::${h}`]?.loading);

  return (
    <ThemeProvider theme={materialTheme}>
      <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', pb: 2 }}>
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            mb: 2,
            p: { xs: 2.5, md: 3.25 },
            color: '#fff',
            borderRadius: 3,
            background: 'linear-gradient(120deg, #314a34 0%, #496b4c 58%, #5d735e 100%)',
            boxShadow: '0 14px 36px rgba(27, 46, 30, 0.2)',
            '&::after': {
              content: '""',
              position: 'absolute',
              width: 230,
              height: 230,
              right: -55,
              top: -110,
              borderRadius: '50%',
              border: '42px solid rgba(255,255,255,0.06)',
            },
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 2.5,
                bgcolor: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <DashboardOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Relatórios
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Dashboard
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Visão geral de associados, atendimentos, pedidos e triagem.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Paper elevation={0} sx={{ ...paperSx, p: { xs: 2, md: 2.5 }, mb: 2 }}>
          <AnalyticsGlobalFilters
            period={draftPeriod}
            onPreset={onPreset}
            onChangeRange={(partial) =>
              setDraftPeriod((p) => ({ ...p, ...partial, preset: 'custom' }))
            }
            onApply={applyGlobal}
            embedded
          />
        </Paper>

        <Paper elevation={0} sx={{ ...paperSx, p: { xs: 2, md: 2.5 } }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mb: 2,
              borderBottom: '1px solid rgba(49, 67, 51, 0.12)',
              minHeight: 44,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                minHeight: 44,
                color: '#5a6b5c',
              },
              '& .Mui-selected': { color: `${GREEN} !important` },
              '& .MuiTabs-indicator': { bgcolor: GREEN, height: 3, borderRadius: '3px 3px 0 0' },
            }}
          >
            {ANALYTICS_TABS.map((t) => (
              <Tab key={t.id} value={t.id} label={t.label} />
            ))}
          </Tabs>

          {anyLoading && !neededHashes.some((h) => cache[`${tab}::${h}`]?.data) ? (
            <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
              <CircularProgress sx={{ color: GREEN }} />
            </Box>
          ) : (
            <Grid container spacing={2}>
              {blocks.map((def) => {
                const h = filterHash(blockFilters[def.id], groupBy);
                const entry = cache[`${tab}::${h}`] || { loading: true };
                return (
                  <AnalyticsBlock
                    key={def.id}
                    def={def}
                    tabId={tab}
                    filters={blockFilters[def.id]}
                    globalPeriod={globalPeriod}
                    data={entry.data}
                    loading={Boolean(entry.loading)}
                    error={entry.error}
                    onChangeFilters={(next) => onChangeBlockFilters(def.id, next)}
                  />
                );
              })}
            </Grid>
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
