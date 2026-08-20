import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { PATHS } from '../../app/menuConfig.js';
import InstitutionalFilters from './institutional/InstitutionalFilters.jsx';
import InstitutionalTable from './institutional/InstitutionalTable.jsx';
import CreateInstitutionalModal from './institutional/CreateInstitutionalModal.jsx';
import InstitutionalModal from './institutional/InstitutionalModal.jsx';
import {
  contactEmail,
  contactPhone,
  displayName,
  documentLabel,
  matchesFilter,
  statusLabel,
  typeLabel,
} from './institutional/institutionalStatus.js';

const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';

const muiTheme = createTheme({
  palette: {
    primary: { main: GREEN },
    secondary: { main: '#705372' },
  },
  typography: {
    fontFamily: 'inherit',
  },
  shape: {
    borderRadius: 12,
  },
});

export default function InstitutionalClientsPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { showError } = useErrorModal();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [limit, setLimit] = useState(60);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [localQ, setLocalQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deepIc = searchParams.get('ic');
      if (deepIc) {
        const res = await api.getInstitutionalClientByCode(deepIc);
        const c = res.data;
        setRows(c ? [c] : []);
        setTotalCount(c ? 1 : 0);
        setSelected(c || null);
        return;
      }

      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('sort', '-date_created');
      params.set('meta', 'filter_count');
      const res = await api.listInstitutionalClients(params.toString());
      setRows(res.data || []);
      const metaCount = res.meta?.filter_count;
      setTotalCount(typeof metaCount === 'number' ? metaCount : (res.data || []).length);
    } catch (err) {
      showError(err.message || 'Falha ao carregar clientes institucionais');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, limit, searchParams, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    let list = rows.filter((c) => matchesFilter(c, filter));
    const q = localQ
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
    if (q) {
      list = list.filter((c) => {
        const blob = [
          displayName(c),
          contactEmail(c),
          contactPhone(c),
          documentLabel(c),
          typeLabel(c),
          statusLabel(c),
          c.representative_name,
          c.company_name,
        ]
          .filter(Boolean)
          .join(' ')
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [rows, filter, localQ]);

  function openClient(c) {
    setSelected(c);
    if (c?.client_code) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('ic', c.client_code);
        return next;
      });
    }
  }

  function closeModal() {
    setSelected(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ic');
      return next;
    });
  }

  function goNewOrder(c) {
    if (!c?.client_code) return;
    navigate(`${PATHS.newOrder}?ic=${encodeURIComponent(c.client_code)}`);
  }

  const canLoadMore = !searchParams.get('ic') && totalCount != null && rows.length < totalCount;

  return (
    <ThemeProvider theme={muiTheme}>
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
              <BusinessOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Acolhimento
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Clientes institucionais
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Consulte empresas e pessoas jurídicas vinculadas à associação.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <InstitutionalFilters
          shownCount={visible.length}
          totalCount={filter || localQ.trim() ? visible.length : totalCount}
          filter={filter}
          onFilterChange={setFilter}
          onReload={load}
          onCreate={() => setCreateOpen(true)}
          localQ={localQ}
          onLocalQ={setLocalQ}
        />

        {loading ? (
          <Box
            sx={{
              py: 10,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: '#fff',
              borderRadius: 3,
              border: '1px solid rgba(49, 67, 51, 0.1)',
            }}
          >
            <CircularProgress size={30} sx={{ color: GREEN }} />
          </Box>
        ) : (
          <>
            <InstitutionalTable rows={visible} onOpen={openClient} />
            {canLoadMore ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setLimit((n) => n + 60)}
                  sx={{
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    color: GREEN,
                    borderColor: 'rgba(73, 107, 76, 0.35)',
                    '&:hover': {
                      borderColor: GREEN,
                      bgcolor: 'rgba(73, 107, 76, 0.06)',
                    },
                  }}
                >
                  Carregar mais
                </Button>
              </Box>
            ) : null}
          </>
        )}

        <CreateInstitutionalModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          api={api}
          onCreated={async (data) => {
            await load();
            if (data) openClient(data);
          }}
        />

        <InstitutionalModal
          open={Boolean(selected)}
          client={selected}
          api={api}
          onClose={closeModal}
          onChanged={load}
          onNewOrder={goNewOrder}
        />
      </Box>
    </ThemeProvider>
  );
}
