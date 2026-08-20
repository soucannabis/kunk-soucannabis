import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import Diversity1OutlinedIcon from '@mui/icons-material/Diversity1Outlined';
import { useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import AssociatesFilters, { PAGE_SIZE_OPTIONS } from './associates/AssociatesFilters.jsx';
import AssociatesTable from './associates/AssociatesTable.jsx';
import CreateAssociateModal from './associates/CreateAssociateModal.jsx';
import AssociateModal from './associates/AssociateModal.jsx';
import {
  buildAssociatesListQuery,
  displayName,
} from './associates/associatesStatus.js';

const muiTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: {
    fontFamily: 'inherit',
  },
  shape: {
    borderRadius: 12,
  },
});
const GREEN = '#496b4c';
const GREEN_HOVER = '#385a3c';
const DEFAULT_PAGE_SIZE = 30;

export default function RegistrationPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { showError } = useErrorModal();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [patientNames, setPatientNames] = useState({});

  const deepA = searchParams.get('a');
  const totalPages = Math.max(1, Math.ceil((Number(totalCount) || 0) / pageSize) || 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (deepA) {
        const res = await api.getUserByCode(deepA, 'patients=1');
        const u = res.data;
        setRows(u ? [u] : []);
        setTotalCount(u ? 1 : 0);
        setSelected(u || null);
        if (u?.patients?.length) {
          setPatientNames({
            [u.user_code]: u.patients.map((p) => displayName(p)).filter(Boolean).join(', '),
          });
        } else if (u?.patient_user_code) {
          try {
            const p = await api.getUserByCode(u.patient_user_code);
            if (p.data) {
              setPatientNames({ [u.user_code]: displayName(p.data) });
            }
          } catch {
            /* ignore */
          }
        } else {
          setPatientNames({});
        }
        return;
      }

      const qs = buildAssociatesListQuery({
        page,
        pageSize,
        search,
        statusFilter: filter,
      });
      const res = await api.listUsers(qs);
      const data = (res.data || []).filter((u) => String(u.status) !== 'patient');
      setRows(data);
      const metaCount = res.meta?.filter_count;
      setTotalCount(typeof metaCount === 'number' ? metaCount : data.length);

      const names = {};
      for (const u of data) {
        const fromHydrate = (u.patients || [])
          .map((p) => displayName(p))
          .filter(Boolean);
        if (fromHydrate.length) {
          names[u.user_code] = fromHydrate.join(', ');
          continue;
        }
        if (u.patient_user_code) {
          try {
            const p = await api.getUserByCode(u.patient_user_code);
            if (p.data) names[u.user_code] = displayName(p.data);
          } catch {
            /* ignore */
          }
        }
      }
      setPatientNames(names);
    } catch (err) {
      showError(err.message || 'Falha ao carregar associados');
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, deepA, page, pageSize, search, filter, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handlePageSizeChange(nextSize) {
    setPageSize(nextSize);
    setPage(1);
  }

  function handleSearchSubmit() {
    const next = String(searchInput || '').trim();
    setPage(1);
    setSearch(next);
  }

  function handleFilterChange(nextFilter) {
    const nextSearch = String(searchInput || '').trim();
    setPage(1);
    setSearch(nextSearch);
    setFilter(nextFilter);
  }

  function openUser(u) {
    setSelected(u);
    if (u?.user_code) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('a', u.user_code);
        return next;
      });
    }
  }

  function closeModal() {
    setSelected(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('a');
      return next;
    });
  }

  const showPager = !deepA && !loading;

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
              <Diversity1OutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Acolhimento
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Gestão de associados
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Consulte cadastros, acompanhe jornadas e mantenha os dados atualizados.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <AssociatesFilters
          filter={filter}
          onFilterChange={handleFilterChange}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearch={handleSearchSubmit}
          onReload={() => load()}
          onCreate={() => setCreateOpen(true)}
          page={page}
          pageSize={pageSize}
          totalCount={deepA ? rows.length : totalCount}
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
            <AssociatesTable
              rows={rows}
              onOpen={openUser}
              patientNames={patientNames}
            />
            {showPager ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: { xs: 'center', sm: 'space-between' },
                  gap: 1.5,
                  flexWrap: 'wrap',
                  mt: 2,
                  px: { xs: 1.5, sm: 2 },
                  py: 1.25,
                  bgcolor: 'rgba(255,255,255,0.92)',
                  border: '1px solid rgba(49, 67, 51, 0.1)',
                  borderRadius: 2.5,
                  boxShadow: '0 6px 22px rgba(34, 53, 36, 0.05)',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" sx={{ color: '#6a766c' }}>
                    Itens por página
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 72 }}>
                  <Select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      borderRadius: 2,
                      '& .MuiSelect-select': { py: 0.75 },
                    }}
                    MenuProps={{
                      PaperProps: { sx: { maxHeight: 280 } },
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <MenuItem key={n} value={n}>
                        {n}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <IconButton
                    size="small"
                    aria-label="Página anterior"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    sx={{
                      border: '1px solid rgba(49, 67, 51, 0.14)',
                      borderRadius: 2,
                      color: GREEN,
                      '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.08)' },
                    }}
                  >
                    <ChevronLeftRoundedIcon />
                  </IconButton>
                  <Typography variant="body2" sx={{ minWidth: 105, textAlign: 'center', color: '#465348' }}>
                    Página <strong>{page}</strong> de {totalPages}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Próxima página"
                    disabled={page >= totalPages || totalCount === 0}
                    onClick={() => {
                      setPage((p) => p + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    sx={{
                      borderRadius: 2,
                      color: '#fff',
                      bgcolor: GREEN,
                      '&:hover': { bgcolor: GREEN_HOVER },
                      '&.Mui-disabled': { color: '#aab3ab', bgcolor: '#edf0ed' },
                    }}
                  >
                    <ChevronRightRoundedIcon />
                  </IconButton>
                </Stack>
              </Box>
            ) : null}
          </>
        )}

        <CreateAssociateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          api={api}
          onCreated={async (data) => {
            if (data?.__existing && data.user_code) {
              try {
                const res = await api.getUserByCode(data.user_code);
                openUser(res.data);
              } catch (err) {
                showError(err.message || 'Conta já existe');
              }
              return;
            }
            if (page === 1) await load();
            else setPage(1);
            if (data) openUser(data);
          }}
        />

        <AssociateModal
          open={Boolean(selected)}
          user={selected}
          api={api}
          onClose={closeModal}
          onChanged={() => load()}
        />
      </Box>
    </ThemeProvider>
  );
}
