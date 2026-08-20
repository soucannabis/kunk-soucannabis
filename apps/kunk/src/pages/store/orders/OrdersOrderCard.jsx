import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import StatusLoggi from './StatusLoggi.jsx';
import { displayTrackingCode } from './TrackingPanel.jsx';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PaymentIcon from '@mui/icons-material/Payment';
import SyncIcon from '@mui/icons-material/Sync';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

const GREEN = '#5a7a5b';
const PURPLE = '#7A5B7A';
const GOLD = '#cea925';

const actionBtnSx = (bg, hover) => ({
  minWidth: 36,
  width: 36,
  height: 36,
  p: 0,
  bgcolor: bg,
  color: '#fff',
  border: 'none',
  '&:hover': { bgcolor: hover },
});

function formatMoney(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function itemStock(item, productStockMap) {
  if (productStockMap instanceof Map) {
    if (item?.product_id != null && productStockMap.has(Number(item.product_id))) {
      return Number(productStockMap.get(Number(item.product_id)));
    }
    const sku = item?.code || item?.sku;
    if (sku && productStockMap.has(String(sku))) {
      return Number(productStockMap.get(String(sku)));
    }
  }
  if (item?.stock_at_order != null && item.stock_at_order !== '') {
    return Number(item.stock_at_order);
  }
  return null;
}

function orderHasZeroStock(items, productStockMap) {
  return (items || []).some((it) => {
    const snap =
      it?.stock_at_order != null && it.stock_at_order !== '' ? Number(it.stock_at_order) : null;
    if (snap != null && snap <= 0) return true;
    const current = itemStock(it, productStockMap);
    return current != null && current <= 0;
  });
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch {
    return String(v);
  }
}

function addressLine(addr) {
  if (!addr || typeof addr !== 'object') return '—';
  const parts = [
    addr.street,
    addr.number || addr.street_number,
    addr.neighborhood,
    addr.city,
    addr.state,
    addr.cep,
  ].filter(Boolean);
  return parts.join(', ') || '—';
}

export default function OrdersOrderCard({
  order,
  selected,
  onToggleSelect,
  awaitingStatus,
  paidStatus,
  labelFlags,
  onStatusChange,
  onCreateLabel,
  onCancelLabel,
  onOpenCart,
  onDelete,
  onCopyTracking,
  onOpenTracking,
  onOpenDetails,
  onAddressValidationDetail,
  onOpenPayment,
  onRetrySync,
  splitMode = false,
  pagarmeForOrders = false,
  zebra,
  dateField = 'created_date',
  labelBusy = false,
  statusBusy = false,
  productStockMap = null,
  addressValidationEnabled = false,
}) {
  const total = Number(order.total || 0);
  const paymentLocked = Boolean(splitMode && total > 0);
  const canToggleBase = order.status === awaitingStatus || order.status === paidStatus;
  // Com split: só libera reverter pago→aguardando (não marcar pago pelo toggle).
  const canToggle =
    canToggleBase &&
    !(paymentLocked && order.status === awaitingStatus) &&
    !statusBusy;
  const carrier = String(
    order.freight_carrier || order.freight_option?.provider || ''
  ).toLowerCase();
  const labelProvider =
    carrier === 'loggi' || carrier === 'melhorenvio' ? carrier : null;
  const activeLabelProviders = labelProvider
    ? (labelFlags?.[labelProvider] ? [labelProvider] : [])
    : ['loggi', 'melhorenvio'].filter((provider) => Boolean(labelFlags?.[provider]));
  const trackingDisplay = displayTrackingCode(order);
  const hasLabel = Boolean(order.tracking_code || order.carrier_order_code);
  const hasTracking = Boolean(trackingDisplay);
  const tags = Array.isArray(order.tags)
    ? order.tags.map((t) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean)
    : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const info = order.details || order.info || order.order_notes;

  const dateLabel = dateField === 'payment_date' ? 'Pago em' : 'Criado em';
  const dateValue =
    dateField === 'payment_date'
      ? formatDate(order.payment_date)
      : formatDate(order.date_created || order.created_date);

  function togglePaymentStatus() {
    if (!canToggle || statusBusy) return;
    const next = order.status === awaitingStatus ? paidStatus : awaitingStatus;
    onStatusChange(order, next);
  }

  return (
    <Box
      component="article"
      data-testid={`order-card-${order.id}`}
      sx={{
        mb: 1.5,
        p: { xs: 1.5, sm: 2 },
        pt: { xs: 8, sm: 9.5 },
        borderRadius: 2,
        backgroundColor: zebra ? '#f5f5f5' : '#fff',
        border: '1px solid #e8e8e8',
        position: 'relative',
      }}
    >
      {/* Status — canto superior direito */}
      <Box
        sx={{
          position: 'absolute',
          top: { xs: 12, sm: 16 },
          right: { xs: 12, sm: 16 },
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 0.5,
          maxWidth: { xs: 'calc(100% - 56px)', sm: 'none' },
        }}
      >
        {statusBusy ? (
          <Box
            data-testid={`order-status-loading-${order.id}`}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, py: 0.5 }}
          >
            <CircularProgress size={18} sx={{ color: GREEN }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Atualizando status…
            </Typography>
          </Box>
        ) : canToggle ? (
          <Tooltip title="Clique para alternar o status" placement="bottom" arrow>
            <Box
              component="span"
              onClick={togglePaymentStatus}
              data-testid={`order-status-${order.id}`}
              sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              <StatusLoggi status={order.status} emphasized />
            </Box>
          </Tooltip>
        ) : (
          <StatusLoggi status={order.status || '—'} emphasized />
        )}
        {order.status === paidStatus && order.payment_date && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Pago em:{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {formatDate(order.payment_date)}
            </Box>
          </Typography>
        )}
        {!canToggle && order.last_tracking_date && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Atualizado:{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {formatDate(order.last_tracking_date)}
            </Box>
          </Typography>
        )}
      </Box>

      {/* Data — canto superior esquerdo */}
      <Box
        sx={{
          position: 'absolute',
          top: { xs: 12, sm: 16 },
          left: { xs: 12, sm: 16 },
          zIndex: 1,
          maxWidth: { xs: 'calc(50% - 20px)', sm: '48%' },
        }}
      >
        <Typography sx={{ fontSize: 15, lineHeight: 1.3 }}>
          {dateLabel}:{' '}
          <Box component="span" sx={{ fontWeight: 700 }}>
            {dateValue}
          </Box>
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: { xs: 0, lg: 2 },
          alignItems: 'stretch',
          width: '100%',
          mt: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', pt: 0.25, pb: { xs: 1, lg: 0 } }}>
          <Checkbox
            size="small"
            checked={selected}
            onChange={() => onToggleSelect(order.id)}
            data-testid={`order-select-${order.id}`}
          />
        </Box>

        {/* Coluna 1 — identidade / endereço */}
        <Box
          sx={{
            flex: '1.35 1 0',
            minWidth: 0,
            pr: { lg: 1 },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
            <Box
              sx={{
                bgcolor: GREEN,
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                px: 1.25,
                py: 0.75,
                borderRadius: 1,
                lineHeight: 1.2,
              }}
            >
              {order.id}
            </Box>
          </Box>

          <Typography sx={{ fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word', mb: 0.5 }}>
            {order.receiver_name || order.associate_name || 'Sem nome'}
          </Typography>
          {order.receiver_name &&
            order.associate_name &&
            order.receiver_name !== order.associate_name && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {order.institutional_client_id || order.institutional_client_code
                  ? 'Cliente: '
                  : 'Associado: '}
                {order.associate_name}
              </Typography>
            )}
          {(order.institutional_client_id || order.institutional_client_code) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Institucional
              {order.institutional_client_code ? ` · ${order.institutional_client_code}` : ''}
            </Typography>
          )}
          {order.user_code && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {order.user_code}
            </Typography>
          )}
          {order.production_owner &&
            String(order.production_owner).trim().toLowerCase() !== 'não atribuído' && (
            <Chip
              size="small"
              label={`No relatório de produção (${order.production_owner})`}
              sx={{ mt: 0.5, bgcolor: '#e8f2e8', color: GREEN, fontWeight: 700 }}
            />
          )}

          <Typography
            variant="body2"
            sx={{ mt: 1, lineHeight: 1.5, wordBreak: 'break-word', color: 'text.primary' }}
          >
            {addressLine(order.address)}
          </Typography>

          {addressValidationEnabled &&
            order.address_validation != null &&
            order.address_validation !== '' && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 0.75,
                flexWrap: 'wrap',
              }}
            >
              <Typography
                variant="caption"
                component="span"
                sx={{
                  color:
                    order.address_validation === 'válido'
                      ? 'success.main'
                      : order.address_validation === 'inválido'
                        ? 'error.main'
                        : order.address_validation === 'revisar'
                          ? 'warning.main'
                          : 'text.secondary',
                }}
              >
                Endereço {order.address_validation}
              </Typography>
              {typeof onAddressValidationDetail === 'function' && (
                <Tooltip title="Ver porquê (detalhe da validação)">
                  <IconButton
                    type="button"
                    size="small"
                    aria-label="Detalhes da validação do endereço"
                    onClick={() => onAddressValidationDetail(order)}
                    sx={{ p: 0.35 }}
                  >
                    <VisibilityIcon
                      sx={{
                        fontSize: 18,
                        color:
                          order.address_validation === 'válido'
                            ? 'success.main'
                            : order.address_validation === 'inválido'
                              ? 'error.main'
                              : 'warning.main',
                      }}
                    />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}

          {info != null && String(info).trim() !== '' && (
            <Typography
              variant="body2"
              sx={{
                mt: 0.75,
                lineHeight: 1.45,
                wordBreak: 'break-word',
                color: 'text.secondary',
                whiteSpace: 'pre-line',
                fontSize: 13,
              }}
            >
              {String(info).trim()}
            </Typography>
          )}
        </Box>

        {/* Coluna 2 — itens / total / rastreio */}
        <Box
          sx={{
            flex: '1 1 0',
            minWidth: 0,
            pl: { lg: 2 },
            pt: { xs: 1.5, lg: 0 },
            borderTop: { xs: '1px solid #e8e8e8', lg: 'none' },
            borderLeft: { lg: '1px solid #e8e8e8' },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {items.length > 0 ? (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {orderHasZeroStock(items, productStockMap) && (
                <Box
                  component="li"
                  sx={{
                    mb: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: '#fff3e0',
                    color: '#e65100',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Pedido feito com estoque 0
                </Box>
              )}
              {items.map((item, i) => {
                const code = item.code || item.sku || '';
                const batch = item.batch ? `Lote ${item.batch}` : '';
                const stock = itemStock(item, productStockMap);
                const stockLabel = stock != null ? `Estoque ${stock}` : null;
                const metaLine = [code, batch, stockLabel].filter(Boolean).join(' · ');
                const zero = stock != null && stock <= 0;
                return (
                  <Box component="li" key={i} sx={{ mb: 0.75, '&:last-of-type': { mb: 0 } }}>
                    <Typography sx={{ fontSize: 15, lineHeight: 1.35, fontWeight: 500 }}>
                      {item.quantity || 1}x {item.name || item.code || 'Item'}
                      {zero ? (
                        <Chip
                          size="small"
                          label="Estoque 0"
                          sx={{
                            ml: 1,
                            height: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: '#ffebee',
                            color: '#c62828',
                          }}
                        />
                      ) : null}
                    </Typography>
                    {metaLine ? (
                      <Typography
                        sx={{
                          fontSize: 13,
                          color: zero ? '#c62828' : 'text.secondary',
                          mt: 0.15,
                          fontWeight: zero ? 600 : 400,
                        }}
                      >
                        {metaLine}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ fontSize: 15, color: '#888' }}>
              Sem itens
            </Typography>
          )}

          <Box sx={{ mt: 2.5 }}>
            {Number(order.discount) > 0 && (
              <Typography sx={{ color: '#c62828', fontSize: 14 }}>
                Desconto: -{formatMoney(order.discount)}
              </Typography>
            )}
            {Number(order.donation) > 0 && (
              <Typography sx={{ color: '#c62828', fontSize: 14 }}>
                Doação: -{formatMoney(order.donation)}
              </Typography>
            )}
            <Typography sx={{ fontWeight: 700, fontSize: 16, mt: 0.5 }}>
              Total: {formatMoney(order.total)}
            </Typography>
          </Box>

          {hasTracking && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Rastreio: {trackingDisplay}
              </Typography>
              <IconButton size="small" onClick={() => onCopyTracking(order)} aria-label="Copiar rastreio">
                <ContentCopyIcon fontSize="small" />
              </IconButton>
              {typeof onOpenTracking === 'function' ? (
                <Tooltip title="Detalhes do rastreio">
                  <IconButton
                    size="small"
                    onClick={() => onOpenTracking(order)}
                    aria-label="Detalhes do rastreio"
                    data-testid={`tracking-info-${order.id}`}
                  >
                    <InfoOutlinedIcon fontSize="small" sx={{ color: '#1976d2' }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Box>
          )}
          {!hasTracking && hasLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              Etiqueta gerada — rastreio pendente
            </Typography>
          )}
        </Box>

        {/* Coluna 3 — tags + ações */}
        <Box
          sx={{
            flex: '1 1 0',
            minWidth: 0,
            pl: { lg: 2 },
            pt: { xs: 1.5, lg: 0 },
            borderTop: { xs: '1px solid #e8e8e8', lg: 'none' },
            borderLeft: { lg: '1px solid #e8e8e8' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: { xs: 'stretch', lg: 'flex-end' },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mb: 1.5,
              justifyContent: { lg: 'flex-end' },
              width: '100%',
            }}
          >
            {tags.map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                variant="outlined"
                sx={{ borderColor: GREEN, color: GREEN }}
              />
            ))}
          </Box>

          {(order.soucannabis_order_id || order.soucannabis_sync_error) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mb: 1,
                justifyContent: { lg: 'flex-end' },
                width: '100%',
              }}
              data-testid={`sc-sync-${order.id}`}
            >
              {order.soucannabis_order_id && !order.soucannabis_sync_error ? (
                <Tooltip title={`SC #${order.soucannabis_order_id}`}>
                  <Chip
                    size="small"
                    icon={<CheckCircleOutlineIcon />}
                    label="Sync SC"
                    color="success"
                    variant="outlined"
                  />
                </Tooltip>
              ) : null}
              {order.soucannabis_sync_error ? (
                <Tooltip title={order.soucannabis_sync_error}>
                  <Chip
                    size="small"
                    icon={<SyncProblemIcon />}
                    label="Erro sync"
                    color="error"
                    onClick={() => onRetrySync?.(order)}
                    onDelete={() => onRetrySync?.(order)}
                    deleteIcon={<SyncIcon />}
                  />
                </Tooltip>
              ) : null}
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', lg: 'flex-end' },
              mt: 'auto',
            }}
          >
            {pagarmeForOrders && order.status === awaitingStatus && total > 0 && (
              <Tooltip title="Pagamento Pagar.me">
                <Button
                  data-testid={`pay-${order.id}`}
                  onClick={() => onOpenPayment?.(order)}
                  sx={actionBtnSx('#1565c0', '#0d47a1')}
                >
                  <PaymentIcon fontSize="small" />
                </Button>
              </Tooltip>
            )}
            {activeLabelProviders.map((provider) => (
              <React.Fragment key={provider}>
                <Tooltip
                  title={
                    provider === 'loggi'
                      ? 'Gerar etiqueta Loggi'
                      : 'Gerar etiqueta Melhor Envio'
                  }
                >
                  <span>
                    <Button
                      data-testid={`label-${provider}-${order.id}`}
                      onClick={() => onCreateLabel(order, provider)}
                      disabled={labelBusy}
                      sx={actionBtnSx(PURPLE, '#4d2d4d')}
                    >
                      {labelBusy ? (
                        <CircularProgress size={18} sx={{ color: '#fff' }} />
                      ) : provider === 'loggi' ? (
                        <LocalShippingIcon fontSize="small" />
                      ) : (
                        <Typography component="span" sx={{ fontSize: 11, fontWeight: 800 }}>
                          ME
                        </Typography>
                      )}
                    </Button>
                  </span>
                </Tooltip>
                {hasLabel && provider === labelProvider && (
                  <Tooltip
                    title={
                      provider === 'loggi'
                        ? 'Cancelar etiqueta Loggi'
                        : 'Cancelar etiqueta Melhor Envio'
                    }
                  >
                    <span>
                      <Button
                        data-testid={`cancel-${provider}-${order.id}`}
                        onClick={() => onCancelLabel(order, provider)}
                        disabled={labelBusy}
                        sx={{
                          ...actionBtnSx('#bdbdbd', '#9e9e9e'),
                          color: '#424242',
                          border: '1px solid #e0e0e0',
                        }}
                      >
                        <CancelOutlinedIcon fontSize="small" />
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </React.Fragment>
            ))}
            <Tooltip title="Detalhes do pedido">
              <Button
                data-testid={`details-${order.id}`}
                onClick={() => onOpenDetails?.(order)}
                sx={actionBtnSx(GREEN, '#406040')}
              >
                <InfoOutlinedIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Retornar ao carrinho">
              <Button
                data-testid={`cart-${order.id}`}
                onClick={() => onOpenCart(order)}
                sx={actionBtnSx(GOLD, '#303B30')}
              >
                <ShoppingCartIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Excluir pedido">
              <Button
                data-testid={`delete-${order.id}`}
                onClick={() => onDelete(order)}
                sx={{
                  minWidth: 36,
                  width: 36,
                  height: 36,
                  p: 0,
                  bgcolor: '#fff',
                  color: '#757575',
                  border: '1px solid #e0e0e0',
                  '&:hover': { bgcolor: '#f5f5f5', color: '#b71c1c' },
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
