import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig, ORDER_STATUS_AWAITING, ORDER_STATUS_PAID } from '@kunk/config';
import { PATHS } from '../../app/menuConfig.js';
import OrdersStatusChips from './orders/OrdersStatusChips.jsx';
import OrdersFilters from './orders/OrdersFilters.jsx';
import OrdersOrderCard from './orders/OrdersOrderCard.jsx';
import TrackingDetailsModal from './orders/TrackingDetailsModal.jsx';
import OrdersBulkActions, { OrdersBulkResultDialog } from './orders/OrdersBulkActions.jsx';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { useCacheConfig } from '../../lib/cache/CacheConfigProvider.jsx';
import { fetchLocalProducts, fetchTags } from '../../lib/cache/fetchers.js';
import OrderDetailsModal, { displayTrackingCode } from './orders/OrderDetailsModal.jsx';
import AddressValidationDetailModal from './orders/AddressValidationDetailModal.jsx';
import ProductionReportModal from './orders/ProductionReportModal.jsx';
import { isAddressValidationUiActive, processAutoAddressValidation } from '../../lib/addressValidation.js';
import PaymentModal from '../../components/PaymentModal.jsx';

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
const PURPLE = '#705372';
const PURPLE_HOVER = '#5e4460';
const PAGE_SIZE = 50;

function buildQs(filters, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const p = new URLSearchParams();
  if (filters.status) p.set('status', filters.status);
  if (filters.q) p.set('q', filters.q);
  if (filters.dateFrom) p.set('date_from', filters.dateFrom);
  if (filters.dateTo) p.set('date_to', filters.dateTo);
  if (filters.dateField) p.set('date_field', filters.dateField);
  if (filters.tags?.length) p.set('tags', filters.tags.join(','));
  p.set('limit', String(limit));
  p.set('offset', String(offset));
  return p.toString();
}

export default function OrdersPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { enabled: cacheEnabled } = useCacheConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ total_count: 0 });
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorModal();
  const [msg, setMsg] = useState('');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState('created_date');
  const [offset, setOffset] = useState(0);

  const [statusConfig, setStatusConfig] = useState({
    statuses: [],
    awaiting: ORDER_STATUS_AWAITING,
    paid: ORDER_STATUS_PAID,
  });
  const [tagOptions, setTagOptions] = useState([]);
  const [labelFlags, setLabelFlags] = useState({ loggi: false, melhorenvio: false });
  const [labelBusyId, setLabelBusyId] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [splitMode, setSplitMode] = useState(false);
  const [pagarmeForOrders, setPagarmeForOrders] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);

  const [facetsLoaded, setFacetsLoaded] = useState(false);
  const [statusCounts, setStatusCounts] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(false);

  const [selected, setSelected] = useState(() => new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [detailsOrderId, setDetailsOrderId] = useState(null);
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [addressValidationOrder, setAddressValidationOrder] = useState(null);
  const [addressValidationEnabled, setAddressValidationEnabled] = useState(false);
  const [productionReportOrders, setProductionReportOrders] = useState(null);
  const [productStockMap, setProductStockMap] = useState(() => new Map());
  const deepLinkP = (searchParams.get('p') || '').trim();

  const filters = useMemo(
    () => ({
      q: q.trim(),
      status: statusFilter,
      tags: tagFilter,
      dateFrom,
      dateTo,
      dateField,
    }),
    [q, statusFilter, tagFilter, dateFrom, dateTo, dateField]
  );

  const loadProductStock = useCallback(async () => {
    try {
      const products = await fetchLocalProducts(api, cacheEnabled, 'limit=500&fields=id,sku,amount,name');
      const map = new Map();
      for (const p of products) {
        if (p?.id != null) map.set(Number(p.id), Number(p.amount) || 0);
        if (p?.sku) map.set(String(p.sku), Number(p.amount) || 0);
      }
      setProductStockMap(map);
    } catch {
      /* opcional para exibição */
    }
  }, [api, cacheEnabled]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listOrders(buildQs(filters, { offset }));
      const list = res.data || [];
      setOrders(list);
      setMeta(res.meta || { total_count: list.length });

      // Auto-validação em idle (não bloqueia a listagem)
      const idle =
        typeof window !== 'undefined' && window.requestIdleCallback
          ? (cb) => window.requestIdleCallback(cb, { timeout: 2500 })
          : (cb) => setTimeout(cb, 400);
      idle(async () => {
        try {
          const { updated } = await processAutoAddressValidation(api, list);
          if (updated.size) {
            setOrders((prev) =>
              prev.map((o) =>
                updated.has(o.id) ? { ...o, address_validation: updated.get(o.id) } : o
              )
            );
          }
        } catch {
          /* ignore */
        }
      });
    } catch (err) {
      showError(err.message || 'Falha ao listar pedidos');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [api, filters, offset, showError]);

  const loadFacets = useCallback(async () => {
    setFacetsLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.q) p.set('q', filters.q);
      if (filters.dateFrom) p.set('date_from', filters.dateFrom);
      if (filters.dateTo) p.set('date_to', filters.dateTo);
      if (filters.dateField) p.set('date_field', filters.dateField);
      const res = await api.ordersFacets(p.toString());
      setStatusCounts(res.data?.statusCounts || {});
      setFacetsLoaded(true);
    } catch (err) {
      showError(err.message || 'Falha ao carregar contagens');
    } finally {
      setFacetsLoading(false);
    }
  }, [api, filters, showError]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.ordersStatusConfig();
        setStatusConfig({
          statuses: cfg.data?.statuses || [],
          awaiting: cfg.data?.awaiting || ORDER_STATUS_AWAITING,
          paid: cfg.data?.paid || ORDER_STATUS_PAID,
        });
      } catch {
        /* defaults */
      }
      try {
        const tags = await fetchTags(api, cacheEnabled);
        setTagOptions(tags.map((t) => t.tag || t.name).filter(Boolean));
      } catch {
        setTagOptions([]);
      }
      try {
        const res = await api.freightLabelAvailability();
        setLabelFlags({
          loggi: Boolean(res.data?.loggi),
          melhorenvio: Boolean(res.data?.melhorenvio),
        });
      } catch {
        setLabelFlags({ loggi: false, melhorenvio: false });
      }
      try {
        const res = await api.getPagarmeStatus();
        setSplitMode(Boolean(res.data?.split_mode));
        setPagarmeForOrders(Boolean(res.data?.enabled && res.data?.use_for_orders));
      } catch {
        setSplitMode(false);
        setPagarmeForOrders(false);
      }
      try {
        const res = await api.getGeoapifyStatus();
        setAddressValidationEnabled(isAddressValidationUiActive(res.data));
      } catch {
        setAddressValidationEnabled(false);
      }
    })();
  }, [api, cacheEnabled]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    loadProductStock();
  }, [loadProductStock]);

  useEffect(() => {
    if (!deepLinkP || loading) return;
    const match = orders.find(
      (o) =>
        String(o.order_code) === deepLinkP ||
        String(o.id) === deepLinkP ||
        String(o.carrier_order_code) === deepLinkP
    );
    if (match) {
      setDetailsOrderId(match.id);
      return;
    }
    // Fallback: busca ampla por q=order_code
    (async () => {
      try {
        const res = await api.listOrders(`q=${encodeURIComponent(deepLinkP)}&limit=20`);
        const hit = (res.data || []).find(
          (o) => String(o.order_code) === deepLinkP || String(o.id) === deepLinkP
        );
        if (hit) setDetailsOrderId(hit.id);
      } catch {
        /* ignore */
      }
    })();
  }, [deepLinkP, orders, loading, api]);

  const displayed = showOnlySelected
    ? orders.filter((o) => selected.has(o.id))
    : orders;

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    const ids = displayed.map((o) => o.id);
    const allSelected = ids.length && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function onStatusChange(order, status) {
    setStatusBusyId(order.id);
    try {
      await api.updateOrderStatus(order.id, status);
      setMsg(`Pedido #${order.id} → ${status}`);
      await Promise.all([loadOrders(), loadProductStock()]);
      if (facetsLoaded) await loadFacets();
    } catch (err) {
      showError(err.message || 'Falha ao atualizar status');
    } finally {
      setStatusBusyId(null);
    }
  }

  async function onRetrySync(order) {
    try {
      await api.syncSoucannabisOrder(order.id);
      setMsg(`Sync SouCannabis reenviado para #${order.id}`);
      await loadOrders();
    } catch (err) {
      showError(err.message || 'Falha no retry de sync');
    }
  }

  async function onCreateLabel(order, provider) {
    setMsg('');
    setLabelBusyId(order.id);
    try {
      if (provider === 'loggi') {
        await api.createLoggiLabel({
          order_id: order.id,
          order_code: order.order_code,
          address: order.address,
          name_associate: order.receiver_name || order.associate_name,
          freight_option: order.freight_option,
        });
      } else {
        await api.createMelhorEnvioLabel({
          order_id: order.id,
          order_code: order.order_code,
          address: order.address,
          name_associate: order.receiver_name || order.associate_name,
          freight_option: order.freight_option,
        });
      }
      setMsg(`Etiqueta ${provider === 'melhorenvio' ? 'Melhor Envio' : 'Loggi'} gerada para #${order.id}`);
      await loadOrders();
    } catch (err) {
      showError(err, { title: provider === 'loggi' ? 'Etiqueta Loggi' : 'Etiqueta Melhor Envio' });
    } finally {
      setLabelBusyId(null);
    }
  }

  async function onCancelLabel(order, provider) {
    setMsg('');
    setLabelBusyId(order.id);
    try {
      if (provider === 'loggi') {
        await api.cancelLoggiLabel({
          orderId: order.id,
          tracking_code: displayTrackingCode(order) || order.tracking_code,
          loggi_key: order.carrier_order_code || undefined,
        });
      } else {
        await api.cancelMelhorEnvioLabel({ orderId: order.id });
      }
      setMsg(`Cancelamento ${provider} #${order.id}`);
      await loadOrders();
    } catch (err) {
      showError(err, { title: 'Cancelar etiqueta' });
    } finally {
      setLabelBusyId(null);
    }
  }

  async function onDelete(order) {
    if (!window.confirm(`Excluir pedido #${order.id}?`)) return;
    try {
      await api.deleteOrder(order.id);
      setMsg(`Pedido #${order.id} excluído`);
      await loadOrders();
    } catch (err) {
      showError(err.message || 'Falha ao excluir');
    }
  }

  function onOpenCart(order) {
    const ic = order.institutional_client_code || '';
    if (ic) {
      navigate(
        `${PATHS.newOrder}?ic=${encodeURIComponent(ic)}&p=${encodeURIComponent(order.id)}`
      );
      return;
    }
    const u = order.user_code || '';
    navigate(`${PATHS.newOrder}?u=${encodeURIComponent(u)}&p=${encodeURIComponent(order.id)}`);
  }

  function onCopyTracking(order) {
    const code = displayTrackingCode(order);
    if (code) navigator.clipboard?.writeText(String(code));
    setMsg(code ? 'Rastreio copiado' : 'Pedido sem código de rastreio');
  }

  async function runBulk(body) {
    try {
      const res = await api.ordersBulk(body);
      setBulkResult({ title: `Bulk: ${body.action}`, results: res.data?.results || [] });
      await loadOrders();
      if (facetsLoaded) await loadFacets();
    } catch (err) {
      showError(err.message || 'Falha na ação em massa');
    }
  }

  function openProductionReport() {
    const selectedOrders = orders.filter((order) => selected.has(order.id));
    if (!selectedOrders.length) {
      showError('Selecione ao menos um pedido para gerar o relatório de produção.');
      return;
    }
    setProductionReportOrders(
      [...selectedOrders].sort((a, b) => {
        const aDate = new Date(a.tracking_code_date || 0).getTime() || 0;
        const bDate = new Date(b.tracking_code_date || 0).getTime() || 0;
        return bDate - aDate;
      })
    );
  }

  function applySearch() {
    setOffset(0);
    loadOrders();
  }

  const selectedIds = [...selected];
  const total = meta.total_count || 0;
  const pageFrom = total ? offset + 1 : 0;
  const pageTo = Math.min(offset + PAGE_SIZE, total);
  const allPageSelected =
    displayed.length > 0 && displayed.every((o) => selected.has(o.id));
  const somePageSelected = displayed.some((o) => selected.has(o.id));

  return (
    <ThemeProvider theme={muiTheme}>
      <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', pb: 4 }} data-testid="orders-page">
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
              <LocalShippingOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
              >
                Loja
              </Typography>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                Gestão de pedidos
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
                Filtre, acompanhe status e execute ações em massa nos pedidos.
              </Typography>
            </Box>
          </Stack>
        </Box>

        {msg && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg('')}>
            {msg}
          </Alert>
        )}

        <Box className="pageContainerOptions" sx={{ pb: 1 }}>
          <OrdersStatusChips
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            facetsLoaded={facetsLoaded}
            loading={facetsLoading}
            onLoadFacets={loadFacets}
            onStatusClick={(s) => {
              setOffset(0);
              setStatusFilter((prev) => (prev === s ? '' : s));
            }}
          />

          <OrdersFilters
            q={q}
            setQ={setQ}
            statusFilter={statusFilter}
            setStatusFilter={(v) => {
              setOffset(0);
              setStatusFilter(v);
            }}
            statusOptions={statusConfig.statuses}
            tagFilter={tagFilter}
            setTagFilter={(v) => {
              setOffset(0);
              setTagFilter(v);
            }}
            tagOptions={tagOptions}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            dateField={dateField}
            setDateField={setDateField}
            onSearch={applySearch}
            onClearDates={() => {
              setDateFrom('');
              setDateTo('');
              setOffset(0);
            }}
          />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
            flexWrap="wrap"
            useFlexGap
          >
            <OrdersBulkActions
              selectedCount={selectedIds.length}
              statusOptions={statusConfig.statuses}
              labelFlags={labelFlags}
              onBulkStatus={(status) => runBulk({ ids: selectedIds, action: 'status', status })}
              onBulkTags={(mode, tags) =>
                runBulk({
                  ids: selectedIds,
                  action: mode === 'add' ? 'tags_add' : 'tags_remove',
                  tags,
                })
              }
              onBulkLabel={(provider, kind) =>
                runBulk({
                  ids: selectedIds,
                  action: kind === 'create' ? 'label_create' : 'label_cancel',
                  provider,
                })
              }
              onProductionReport={openProductionReport}
              onShowOnlySelected={() => setShowOnlySelected(true)}
            />
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ color: '#657167' }}>
                {loading
                  ? 'Carregando registros...'
                  : `${displayed.length} de ${total} registro${total === 1 ? '' : 's'}`}
                {!loading && showOnlySelected ? ' (apenas selecionados)' : ''}
              </Typography>
              {showOnlySelected ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowOnlySelected(false)}
                  sx={{
                    color: PURPLE,
                    borderColor: 'rgba(112, 83, 114, 0.3)',
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(112, 83, 114, 0.06)' },
                  }}
                >
                  Mostrar todos
                </Button>
              ) : null}
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={() => loadOrders()}
                data-testid="orders-refresh"
                sx={{
                  bgcolor: PURPLE,
                  color: 'white',
                  minHeight: 36,
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  boxShadow: '0 7px 18px rgba(112, 83, 114, 0.22)',
                  '&:hover': { bgcolor: PURPLE_HOVER },
                }}
              >
                Atualizar
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* Tabela / lista — legado pageContainerTable */}
        <Paper className="pageContainerTable" elevation={0} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: GREEN,
              color: '#fff',
              px: 2,
              py: 1,
              borderRadius: 2,
              mb: 1.5,
            }}
          >
            <Checkbox
              checked={allPageSelected}
              indeterminate={somePageSelected && !allPageSelected}
              onChange={toggleSelectPage}
              data-testid="select-page"
              sx={{
                color: '#fff',
                '&.Mui-checked': { color: '#fff' },
                '&.MuiCheckbox-indeterminate': { color: '#fff' },
              }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Pedidos
            </Typography>
          </Box>

          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress sx={{ color: '#fff' }} />
            </Box>
          ) : displayed.length === 0 ? (
            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
              Nenhum pedido encontrado.
            </Typography>
          ) : (
            displayed.map((o, i) => (
              <OrdersOrderCard
                key={o.id}
                order={o}
                selected={selected.has(o.id)}
                onToggleSelect={toggleSelect}
                awaitingStatus={statusConfig.awaiting}
                paidStatus={statusConfig.paid}
                labelFlags={labelFlags}
                labelBusy={labelBusyId === o.id}
                statusBusy={statusBusyId === o.id}
                onStatusChange={onStatusChange}
                onCreateLabel={onCreateLabel}
                onCancelLabel={onCancelLabel}
                onOpenCart={onOpenCart}
                onDelete={onDelete}
                onCopyTracking={onCopyTracking}
                onOpenTracking={(ord) => setTrackingOrder(ord)}
                onOpenDetails={(ord) => setDetailsOrderId(ord.id)}
                onAddressValidationDetail={
                  addressValidationEnabled
                    ? (ord) => setAddressValidationOrder(ord)
                    : undefined
                }
                onOpenPayment={(ord) => setPaymentOrder(ord)}
                onRetrySync={onRetrySync}
                splitMode={splitMode}
                pagarmeForOrders={pagarmeForOrders}
                zebra={i % 2 === 1}
                dateField={dateField}
                productStockMap={productStockMap}
                addressValidationEnabled={addressValidationEnabled}
              />
            ))
          )}
        </Paper>

        <PaymentModal
          open={Boolean(paymentOrder)}
          onClose={() => setPaymentOrder(null)}
          api={api}
          context="order"
          entity={paymentOrder}
          onSuccess={async () => {
            setMsg(`Link de pagamento gerado para #${paymentOrder?.id}`);
            await loadOrders();
          }}
        />

        <AddressValidationDetailModal
          open={Boolean(addressValidationOrder)}
          order={addressValidationOrder}
          api={api}
          onClose={() => setAddressValidationOrder(null)}
          onOrderPatched={(patched) => {
            if (!patched?.id) return;
            setOrders((prev) => prev.map((o) => (o.id === patched.id ? { ...o, ...patched } : o)));
            setAddressValidationOrder((prev) =>
              prev?.id === patched.id ? { ...prev, ...patched } : prev
            );
          }}
        />

        <OrderDetailsModal
          open={Boolean(detailsOrderId)}
          orderId={detailsOrderId}
          api={api}
          statusOptions={(statusConfig.statuses || []).map((s) => s.value || s).filter(Boolean)}
          awaitingStatus={statusConfig.awaiting}
          paidStatus={statusConfig.paid}
          onClose={() => setDetailsOrderId(null)}
          onSaved={() => {
            loadOrders();
            if (facetsLoaded) loadFacets();
          }}
        />

        <ProductionReportModal
          open={Boolean(productionReportOrders)}
          orders={productionReportOrders || []}
          api={api}
          onClose={() => setProductionReportOrders(null)}
          onComplete={({ owner, markedIds, skipped }) => {
            const marked = new Set(markedIds);
            setOrders((previous) =>
              previous.map((order) =>
                marked.has(order.id) ? { ...order, production_owner: owner } : order
              )
            );
            setProductionReportOrders(null);
            setMsg(
              skipped.length
                ? `Relatório exportado. ${skipped.length} receita(s) não puderam ser incluídas.`
                : 'Relatório de produção exportado e pedidos marcados.'
            );
          }}
        />

        <TrackingDetailsModal
          open={Boolean(trackingOrder)}
          order={trackingOrder}
          api={api}
          onClose={() => setTrackingOrder(null)}
        />

        {!loading && !showOnlySelected && total > PAGE_SIZE && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              flexWrap: 'wrap',
              mx: 'auto',
              mt: 1,
              mb: 3,
              px: 2,
              py: 1.25,
              maxWidth: 520,
              backgroundColor: PURPLE,
              borderRadius: '30px',
              boxShadow: '0 4px 14px rgba(74, 45, 74, 0.35)',
              color: '#fff',
            }}
          >
            <Button
              size="small"
              startIcon={<ChevronLeftIcon />}
              disabled={offset <= 0}
              onClick={() => {
                setOffset((o) => Math.max(0, o - PAGE_SIZE));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              sx={{
                color: '#fff',
                bgcolor: GREEN,
                '&:hover': { bgcolor: GREEN_HOVER },
                '&.Mui-disabled': { color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(0,0,0,0.15)' },
              }}
            >
              Anterior
            </Button>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {pageFrom}–{pageTo} de {total}
            </Typography>
            <Button
              size="small"
              endIcon={<ChevronRightIcon />}
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => {
                setOffset((o) => o + PAGE_SIZE);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              sx={{
                color: '#fff',
                bgcolor: GREEN,
                '&:hover': { bgcolor: GREEN_HOVER },
                '&.Mui-disabled': { color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(0,0,0,0.15)' },
              }}
            >
              Próxima
            </Button>
          </Box>
        )}

        <OrdersBulkResultDialog
          open={Boolean(bulkResult)}
          onClose={() => setBulkResult(null)}
          title={bulkResult?.title}
          results={bulkResult?.results}
        />
      </Box>
    </ThemeProvider>
  );
}
