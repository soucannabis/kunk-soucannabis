import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Modal,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import AddShoppingCartOutlinedIcon from '@mui/icons-material/AddShoppingCartOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonIcon from '@mui/icons-material/Person';
import SaveIcon from '@mui/icons-material/Save';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { PATHS } from '../../app/menuConfig.js';
import { useErrorModal } from '../../components/errors/ErrorModalProvider.jsx';
import { useCacheConfig } from '../../lib/cache/CacheConfigProvider.jsx';
import { contentAreaModalProps } from '../../layout/contentAreaOverlay.js';
import {
  fetchLocalProducts,
  fetchPrescribers,
  fetchSoucannabisProducts,
  fetchTags,
} from '../../lib/cache/fetchers.js';
import AddressEditDialog from '../../components/store/AddressEditDialog.jsx';
import DatePrescriptionEdit from '../../components/store/DatePrescriptionEdit.jsx';

const muiTheme = createTheme();
const GREEN = '#5a7a5b';
const GREEN_HOVER = '#303B30';
const PURPLE = '#7A5B7A';
const PURPLE_HOVER = '#4d2d4d';
const ZEBRA = 'rgb(243, 243, 243)';

/** Endereço de entrega OSS (`delivery_address`) com fallback legado. */
function getDeliveryAddress(u) {
  const d = u?.delivery_address || u?.address_delivery;
  if (d && typeof d === 'object' && d.street) return d;
  return null;
}

function cadastralAddress(u) {
  if (!u) return null;
  return (
    u.address || {
      street: u.street,
      number: u.number || u.street_number,
      neighborhood: u.neighborhood,
      city: u.city,
      state: u.state,
      cep: u.cep || u.postal_code,
      complement: u.complement,
    }
  );
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function computeLocalTotal({ items, deliveryPrice, applyToTotal, discount, donation, customPayment }) {
  const products = roundMoney(
    (items || []).reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 0), 0)
  );
  const freight = applyToTotal ? roundMoney(deliveryPrice) : 0;
  const customRows = Array.isArray(customPayment) ? customPayment : [];
  const customSum = roundMoney(
    customRows.reduce((s, r) => s + (Number(r.value) || 0), 0)
  );
  return {
    products,
    freight,
    discount: roundMoney(discount),
    donation: roundMoney(donation),
    customSum,
    total: roundMoney(Math.max(0, products + freight - roundMoney(discount) - customSum - roundMoney(donation))),
  };
}

function formatPhone(phone) {
  if (!phone) return '—';
  const cleaned = String(phone).replace(/\D/g, '');
  const match = cleaned.match(/^55(\d{2})(\d{5})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return phone;
}

function associateDisplayName(u) {
  if (!u) return '';
  if (u.__kind === 'institutional') {
    if (u.is_company && u.company_name) return String(u.company_name).trim();
    return [u.representative_name, u.representative_last_name].filter(Boolean).join(' ').trim()
      || u.display_name
      || u.client_code
      || '';
  }
  const full = [
    u.name || u.first_name || u.associate_name,
    u.last_name || u.associate_last_name || u.lastname_associate,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  return full || u.email_account || u.user_code || '';
}

function institutionalReceiverName(u) {
  if (!u) return '';
  return [u.representative_name, u.representative_last_name].filter(Boolean).join(' ').trim()
    || associateDisplayName(u);
}

function clientContactEmail(u) {
  if (!u) return '';
  if (u.__kind === 'institutional') {
    return u.company_email || u.representative_email || '';
  }
  return u.email_account || '';
}

function clientContactPhone(u) {
  if (!u) return '';
  if (u.__kind === 'institutional') {
    return u.company_phone || u.representative_mobile || '';
  }
  return u.mobile_number || '';
}

/** Normaliza itens do pedido para a tabela do carrinho (legado: qnt/amount). */
function normalizeCartItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => {
      const code = String(it?.code || it?.sku || '').toLowerCase();
      const name = String(it?.name || '').toLowerCase();
      return code !== 'frete' && name !== 'frete' && it != null;
    })
    .map((it) => ({
      product_id: it.product_id || it.id || null,
      code: it.code || it.sku || String(it.product_id || it.id || ''),
      name: it.name || it.code || 'Item',
      amount: Number(it.amount ?? it.price ?? it.value) || 0,
      quantity: Math.max(1, Number(it.quantity ?? it.qnt ?? it.qty) || 1),
      batch: it.batch || null,
      stock_at_order: it.stock_at_order != null ? Number(it.stock_at_order) : null,
    }));
}

function prescriptionBanner(u) {
  if (!u?.date_prescription) {
    return { ok: false, label: 'Data não informada' };
  }
  const d = new Date(u.date_prescription);
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 1);
  const expired = d.getTime() < limit.getTime();
  const formatted = d.toLocaleDateString('pt-BR');
  return {
    ok: !expired,
    label: expired ? `${formatted} - Prescrição vencida` : formatted,
  };
}

function statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('aguard') || s.includes('await')) return { bg: '#FFF3CD', color: '#664d03' };
  if (s.includes('pago') || s.includes('paid') || s.includes('conclu')) return { bg: '#D1E7DD', color: '#0f5132' };
  if (s.includes('cancel')) return { bg: '#F8D7DA', color: '#842029' };
  return { bg: '#E2E3E5', color: '#41464b' };
}

export default function CartPage() {
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { enabled: cacheEnabled } = useCacheConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userCodeFromQuery = (searchParams.get('u') || '').trim();
  const institutionalCodeFromQuery = (searchParams.get('ic') || '').trim();
  const orderRefFromQuery = (searchParams.get('p') || '').trim();

  const [associate, setAssociate] = useState(null);
  const [loadingAssociate, setLoadingAssociate] = useState(
    Boolean(userCodeFromQuery || institutionalCodeFromQuery)
  );

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [qtyBySku, setQtyBySku] = useState({});

  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [donation, setDonation] = useState(0);
  const [customPaymentDraft, setCustomPaymentDraft] = useState({ item: '', qnt: 1, value: 0 });
  const [customPayment, setCustomPayment] = useState([]);
  const [showCustomPayment, setShowCustomPayment] = useState(false);

  const [info, setInfo] = useState('');
  const [orderTags, setOrderTags] = useState([]);
  const [tagOptions, setTagOptions] = useState([]);
  const [scTagOptions, setScTagOptions] = useState([]);
  const [catalogSource, setCatalogSource] = useState('local');

  const [prescriber, setPrescriber] = useState('');
  const [prescriberCode, setPrescriberCode] = useState('');
  const [professionals, setProfessionals] = useState([]);
  const [showPrescriberModal, setShowPrescriberModal] = useState(false);
  const [newPrescriber, setNewPrescriber] = useState({ name: '', last_name: '', email: '' });

  const [freightOptions, setFreightOptions] = useState([]);
  const [selectedFreight, setSelectedFreight] = useState(null);
  const [applyToTotal, setApplyToTotal] = useState(true);
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightQuoteEnabled, setFreightQuoteEnabled] = useState(false);

  const { showError } = useErrorModal();
  const [history, setHistory] = useState([]);
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [openAddressEdit, setOpenAddressEdit] = useState(false);

  const totals = computeLocalTotal({
    items,
    deliveryPrice: selectedFreight ? Number(selectedFreight.price) || 0 : 0,
    applyToTotal,
    discount,
    donation,
    customPayment,
  });

  const rx = associate?.__kind === 'institutional'
    ? { ok: true, label: 'Cliente institucional (sem prescrição)' }
    : prescriptionBanner(associate);
  const deliveryAddr = getDeliveryAddress(associate);
  const hasOwnerQuery = Boolean(userCodeFromQuery || institutionalCodeFromQuery);
  const associateReady = Boolean(
    associate && (associate.id || associate.user_code || associate.client_code || associate.__from_order_stub)
  );

  async function fetchOrderByRef(ref) {
    if (!ref) return null;
    if (/^\d+$/.test(ref)) {
      const res = await api.getOrder(ref);
      return res.data || null;
    }
    const res = await api.listOrders(`q=${encodeURIComponent(ref)}&limit=50`);
    return (
      (res.data || []).find(
        (o) => String(o.order_code) === ref || String(o.id) === ref
      ) || null
    );
  }

  function stubAssociateFromOrder(order, fallbackUserCode) {
    const addr = order?.address && typeof order.address === 'object' ? order.address : null;
    return {
      id: order?.user || null,
      user_code: order?.user_code || fallbackUserCode || null,
      associate_name: order?.associate_name || order?.receiver_name || 'Associado',
      associate_last_name: '',
      delivery_address: addr,
      street: addr?.street || null,
      street_number: addr?.street_number || addr?.number || null,
      number: addr?.number || addr?.street_number || null,
      complement: addr?.complement || null,
      neighborhood: addr?.neighborhood || null,
      city: addr?.city || null,
      state: addr?.state || null,
      cep: addr?.cep || null,
      __from_order_stub: true,
    };
  }

  async function applyAssociate(u) {
    if (!u) return;
    setAssociate(u);
    if (u.__kind === 'institutional' && u.id) {
      try {
        const hist = await api.getInstitutionalClientHistory(u.id);
        setHistory(hist.data?.orders || []);
      } catch {
        setHistory([]);
      }
      return;
    }
    if (u.user_code) {
      try {
        const hist = await api.ordersByUser(u.user_code);
        setHistory(hist.data || []);
      } catch {
        setHistory([]);
      }
    }
  }

  useEffect(() => {
    if (!userCodeFromQuery && !institutionalCodeFromQuery) {
      setAssociate(null);
      setLoadingAssociate(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoadingAssociate(true);
      try {
        if (institutionalCodeFromQuery) {
          const res = await api.getInstitutionalClientByCode(institutionalCodeFromQuery);
          if (!cancelled) {
            await applyAssociate({ ...res.data, __kind: 'institutional' });
          }
          return;
        }
        const res = await api.getUserByCode(userCodeFromQuery);
        if (!cancelled) await applyAssociate(res.data);
      } catch (err) {
        if (cancelled) return;
        // Pedido em edição (?p=): monta associado a partir do pedido se o cadastro não existir
        if (orderRefFromQuery && userCodeFromQuery) {
          try {
            const order = await fetchOrderByRef(orderRefFromQuery);
            if (order && !cancelled) {
              await applyAssociate(stubAssociateFromOrder(order, userCodeFromQuery));
              applyOrderToCart(order, { asEdit: true });
              setSuccess(
                `Editando pedido #${order.id} (cadastro do associado não encontrado — usando dados do pedido)`
              );
              return;
            }
          } catch {
            /* cai no erro abaixo */
          }
        }
        setAssociate(null);
        if (institutionalCodeFromQuery) {
          showError(
            err.message || `Cliente institucional ${institutionalCodeFromQuery} não encontrado`
          );
          return;
        }
        const looksLikeLead = /^LEAD-/i.test(userCodeFromQuery);
        showError(
          looksLikeLead
            ? 'Use o código do usuário (user_code), não o código de lead da triagem. Vincule o associado na triagem e abra o pedido de novo.'
            : err.message || `Associado ${userCodeFromQuery} não encontrado`
        );
      } finally {
        if (!cancelled) setLoadingAssociate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, userCodeFromQuery, institutionalCodeFromQuery, orderRefFromQuery]);

  useEffect(() => {
    if (!userCodeFromQuery && !institutionalCodeFromQuery && !orderRefFromQuery) return undefined;
    (async () => {
      setProductsLoading(true);
      let scCatalog = false;
      try {
        const st = await api.getSoucannabisOrdersStatus();
        scCatalog = Boolean(st.data?.enabled && st.data?.sync_products !== false);
      } catch {
        scCatalog = false;
      }
      setCatalogSource(scCatalog ? 'soucannabis' : 'local');
      try {
        if (scCatalog) {
          const rows = await fetchSoucannabisProducts(api, cacheEnabled);
          setProducts(
            rows.map((p) => ({
              id: p.id,
              name: p.name || p.title || 'Produto',
              sku: p.sku || p.code || String(p.id),
              code: p.code || p.sku || String(p.id),
              price: Number(p.price ?? p.value ?? p.amount_price ?? 0) || 0,
              amount: null,
              batch: p.batch || '',
              soucannabis: true,
            }))
          );
        } else {
          const rows = await fetchLocalProducts(api, cacheEnabled, 'limit=200');
          setProducts(rows);
        }
      } catch {
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
      try {
        const rows = await fetchPrescribers(api, cacheEnabled);
        setProfessionals(rows);
      } catch {
        /* ignore */
      }
      try {
        const tags = await fetchTags(api, cacheEnabled);
        setTagOptions(tags.map((t) => t.tag || t.name).filter(Boolean));
      } catch {
        setTagOptions([]);
      }
      if (scCatalog) {
        try {
          const res = await api.listSoucannabisTags();
          const rows = Array.isArray(res.data) ? res.data : [];
          setScTagOptions(
            rows
              .map((t) => (typeof t === 'string' ? t : t?.tag || t?.name || ''))
              .map((t) => String(t).trim())
              .filter(Boolean)
          );
        } catch {
          setScTagOptions([]);
        }
      } else {
        setScTagOptions([]);
      }
      try {
        const res = await api.freightQuoteAvailability();
        setFreightQuoteEnabled(Boolean(res.data?.quote_enabled));
      } catch {
        setFreightQuoteEnabled(false);
      }
    })();
  }, [api, cacheEnabled, userCodeFromQuery, institutionalCodeFromQuery, orderRefFromQuery]);

  const groupedTagOptions = useMemo(() => {
    return [
      ...tagOptions.map((t) => ({ tag: t, group: 'Tags do sistema' })),
      ...scTagOptions.map((t) => ({ tag: t, group: 'Tags SouCannabis' })),
    ];
  }, [tagOptions, scTagOptions]);

  const filteredProducts = useMemo(() => {
    const term = productFilter.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => String(p.name || '').toLowerCase().includes(term));
  }, [products, productFilter]);

  function addProduct(product) {
    const key = product.sku || String(product.id);
    const qty = Math.max(1, Number(qtyBySku[key]) || 1);
    const stock = Number(product.amount);
    setItems((prev) => {
      const existing = prev.find((i) => i.code === key || i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i === existing
            ? {
                ...i,
                quantity: Number(i.quantity) + qty,
                stock_at_order: Number.isFinite(stock) ? stock : i.stock_at_order,
              }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          code: key,
          name: product.name,
          amount: Number(product.price) || 0,
          quantity: qty,
          batch: product.batch || null,
          stock_at_order: Number.isFinite(stock) ? stock : null,
        },
      ];
    });
  }

  const productsById = useMemo(() => {
    const map = new Map();
    for (const p of products) map.set(p.id, p);
    for (const p of products) {
      if (p.sku) map.set(p.sku, p);
    }
    return map;
  }, [products]);

  function stockForItem(it) {
    const p =
      (it.product_id != null && productsById.get(it.product_id)) ||
      (it.code && productsById.get(it.code)) ||
      null;
    if (p && p.amount != null) return Number(p.amount);
    if (it.stock_at_order != null) return Number(it.stock_at_order);
    return null;
  }

  const zeroStockItems = useMemo(() => {
    return items.filter((it) => {
      const p =
        (it.product_id != null && productsById.get(it.product_id)) ||
        (it.code && productsById.get(it.code)) ||
        null;
      const stock =
        p && p.amount != null
          ? Number(p.amount)
          : it.stock_at_order != null
            ? Number(it.stock_at_order)
            : null;
      return stock != null && stock <= 0;
    });
  }, [items, productsById]);

  function updateItemQty(idx, quantity) {
    setItems((prev) =>
      prev
        .map((it, i) => (i === idx ? { ...it, quantity: Number(quantity) || 0 } : it))
        .filter((it) => it.quantity > 0)
    );
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function quoteFreight() {
    if (!associate) {
      showError('Selecione um associado');
      return;
    }
    setFreightLoading(true);
    const address = getDeliveryAddress(associate) || cadastralAddress(associate);
    if (!address?.cep) {
      setFreightLoading(false);
      showError('Associado sem CEP para cotar frete');
      return;
    }
    try {
      const res = await api.freightQuote({ address, items });
      setFreightOptions(res.data?.options || []);
      setApplyToTotal(res.data?.apply_to_total !== false);
      const selKey = res.data?.selected_option_key;
      const sel =
        (res.data?.options || []).find((o) => o.option_key === selKey) ||
        (res.data?.options || [])[0] ||
        null;
      setSelectedFreight(sel);
      const quoteErrors = res.data?.errors;
      if (quoteErrors?.length && !(res.data?.options || []).length) {
        showError(quoteErrors.map((e) => `${e.provider}: ${e.message}`).join(' · '));
      } else if (quoteErrors?.length) {
        showError(`Algumas cotações falharam: ${quoteErrors.map((e) => e.provider).join(', ')}`);
      }
    } catch (err) {
      setFreightOptions([]);
      setSelectedFreight(null);
      const incomplete =
        err.code === 'CONFIG_INCOMPLETE' ||
        /CONFIG_INCOMPLETE|não configurado|incompleto/i.test(err.message || '');
      const providerDetail = (err.details?.errors || err.errors || [])
        .map((e) => e.message)
        .filter(Boolean)
        .join(' · ');
      showError(
        incomplete
          ? `${err.message || 'Configuração de frete incompleta'}. Preencha em Admin → Serviços externos → Dados de envio.`
          : providerDetail || err.message || 'Falha ao cotar frete'
      );
    } finally {
      setFreightLoading(false);
    }
  }

  async function createPrescriber() {
    try {
      const res = await api.createItem('professionals', {
        ...newPrescriber,
        is_prescriber: true,
        active: true,
      });
      const p = res.data;
      setProfessionals((prev) => [...prev, p]);
      setPrescriber(`${p.name || ''} ${p.last_name || ''}`.trim());
      setPrescriberCode(p.professional_code || String(p.id));
      setShowPrescriberModal(false);
      setNewPrescriber({ name: '', last_name: '', email: '' });
    } catch (err) {
      showError(err.message || 'Falha ao criar prescritor');
    }
  }

  function handleAddCustomPayment() {
    if (!customPaymentDraft.item || !(Number(customPaymentDraft.value) > 0)) return;
    setCustomPayment((prev) => [
      ...prev,
      {
        item: customPaymentDraft.item,
        qnt: Number(customPaymentDraft.qnt) || 1,
        value: Number(customPaymentDraft.value) || 0,
      },
    ]);
    setCustomPaymentDraft({ item: '', qnt: 1, value: 0 });
    setShowCustomPayment(false);
  }

  const canSubmitOrder = items.length > 0 && !submitting;

  async function submitOrder({ forceWrongTotal = false } = {}) {
    setSuccess('');
    if (!associate) {
      showError('Selecione um associado ou cliente institucional');
      return;
    }
    if (!items.length) {
      showError('Adicione itens');
      return;
    }
    if (catalogSource !== 'soucannabis' && zeroStockItems.length > 0) {
      const names = zeroStockItems.map((it) => it.name || it.code).join(', ');
      const ok = window.confirm(
        `Atenção: pedido com estoque 0 (ou negativo): ${names}.\n\nDeseja continuar mesmo assim?`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const address = getDeliveryAddress(associate) || cadastralAddress(associate);
      const isIc = associate.__kind === 'institutional';
      const body = {
        ...(isIc
          ? {
              institutional_client_id: associate.id,
              institutional_client_code: associate.client_code,
              name_associate: associateDisplayName(associate),
              receiver_name: institutionalReceiverName(associate),
              email: clientContactEmail(associate),
            }
          : {
              ...(associate.id ? { user: associate.id } : {}),
              user_code: associate.user_code,
              name_associate: associateDisplayName(associate),
              receiver_name: associate.receiver_name || associateDisplayName(associate),
              email: associate.email_account,
            }),
        address: address?.street ? address : associate.delivery_address || address,
        items,
        total: forceWrongTotal ? totals.total + 99 : totals.total,
        delivery_price: selectedFreight ? Number(selectedFreight.price) || 0 : 0,
        freight_carrier: selectedFreight?.provider || null,
        freight_option: selectedFreight || null,
        discount: Number(discount) || 0,
        donation: Number(donation) || 0,
        custom_payment: customPayment,
        prescriber,
        prescriber_code: prescriberCode,
        info,
        tags: orderTags,
        status: 'Aguardando pagamento',
      };
      let res;
      if (editingOrderId) {
        res = await api.updateOrder(editingOrderId, body);
      } else {
        res = await api.createOrder(body);
      }
      setSuccess(`Pedido ${res.data?.order_code || res.data?.id} salvo`);
      setEditingOrderId(null);
      navigate(PATHS.orders);
    } catch (err) {
      showError(err?.errors?.[0]?.message || err.message || 'Falha ao salvar pedido');
    } finally {
      setSubmitting(false);
    }
  }

  function applyOrderToCart(o, { asEdit = true } = {}) {
    if (!o) return;
    setEditingOrderId(asEdit ? o.id : null);
    setItems(normalizeCartItems(o.items));
    setDiscount(Number(o.discount) || 0);
    setDonation(Number(o.donation) || 0);
    setCustomPayment(Array.isArray(o.custom_payment) ? o.custom_payment : []);
    setShowCustomPayment(Array.isArray(o.custom_payment) && o.custom_payment.length > 0);
    setInfo(o.info || o.details || o.order_notes || '');
    setOrderTags(
      Array.isArray(o.tags)
        ? o.tags.map((t) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean)
        : []
    );
    setSelectedFreight(o.freight_option || null);
    setApplyToTotal(true);
    if (o.prescriber) setPrescriber(o.prescriber);
    if (o.prescriber_code) setPrescriberCode(o.prescriber_code);
    setSuccess(asEdit ? `Editando pedido #${o.id}` : `Itens do pedido #${o.id} carregados`);
  }

  function loadHistoryOrder(o) {
    applyOrderToCart(o, { asEdit: true });
  }

  useEffect(() => {
    if (!orderRefFromQuery) return undefined;
    // Se o stub do associado já aplicou o pedido, ainda assim re-sincroniza
    let cancelled = false;
    (async () => {
      try {
        const order = await fetchOrderByRef(orderRefFromQuery);
        if (cancelled) return;
        if (!order) {
          showError(`Pedido ${orderRefFromQuery} não encontrado`);
          return;
        }
        applyOrderToCart(order, { asEdit: true });
      } catch (err) {
        if (!cancelled) showError(err.message || 'Falha ao carregar pedido no carrinho');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, orderRefFromQuery, userCodeFromQuery, institutionalCodeFromQuery]);

  const headCell = {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    borderBottom: '2px solid #fff',
    textAlign: 'center',
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <Box data-testid="cart-page" sx={{ width: '100%', pb: 4 }}>
        {!hasOwnerQuery && (
          <Alert severity="warning" data-testid="cart-missing-user" sx={{ mb: 2, ml: '20px', mr: 2 }}>
            Novo pedido exige o código do associado (<code>?u=</code>) ou do cliente institucional (
            <code>?ic=</code>) na URL. Abra a partir da triagem, do cadastro do associado ou de clientes
            institucionais.
          </Alert>
        )}
        {success && (
          <Alert severity="success" data-testid="cart-success" sx={{ mb: 2, ml: '20px', mr: 2 }} onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}
        {associate?.__from_order_stub && (
          <Alert severity="warning" sx={{ mb: 2, ml: '20px', mr: 2 }}>
            Associado <code>{associate.user_code}</code> não encontrado no cadastro. O carrinho está
            usando nome/endereço salvos no pedido #{editingOrderId || orderRefFromQuery}.
          </Alert>
        )}

        {hasOwnerQuery && (
          <>
        {/* Toolbar prescritor — legado */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: '100%', mb: 1, ml: '20px', pr: 2 }}>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            data-testid="open-prescriber-modal"
            onClick={() => setShowPrescriberModal(true)}
            sx={{ backgroundColor: PURPLE, '&:hover': { backgroundColor: '#684c68' } }}
          >
            Novo Prescritor
          </Button>
        </Box>

        {/* Modal novo prescritor */}
        <Modal open={showPrescriberModal} onClose={() => setShowPrescriberModal(false)} {...contentAreaModalProps}>
          <Box
            data-testid="prescriber-modal"
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 420,
              bgcolor: 'background.paper',
              p: 3,
              borderRadius: 1,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2 }}>
              Novo prescritor
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Nome"
              data-testid="prescriber-name"
              value={newPrescriber.name}
              onChange={(e) => setNewPrescriber((p) => ({ ...p, name: e.target.value }))}
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth
              size="small"
              label="Sobrenome"
              data-testid="prescriber-last-name"
              value={newPrescriber.last_name}
              onChange={(e) => setNewPrescriber((p) => ({ ...p, last_name: e.target.value }))}
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth
              size="small"
              label="E-mail"
              value={newPrescriber.email}
              onChange={(e) => setNewPrescriber((p) => ({ ...p, email: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setShowPrescriberModal(false)}>Cancelar</Button>
              <Button variant="contained" onClick={createPrescriber} sx={{ bgcolor: PURPLE }}>
                Salvar
              </Button>
            </Stack>
          </Box>
        </Modal>

        {loadingAssociate && !associate && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }}>
            <CircularProgress size={36} sx={{ color: '#fff' }} />
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
              Carregando dados do pedido...
            </Typography>
          </Box>
        )}

        {/* Painel associado / cliente institucional */}
        {associateReady && (
          <Box className="pageContainerOptions" sx={{ mb: '20px', ml: '20px', mr: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="h6" gutterBottom>
                  {associate.__kind === 'institutional' ? 'Cliente institucional' : 'Dados Pessoais'}
                </Typography>
                <Typography variant="body1" data-testid="associate-selected">
                  <strong>Nome:</strong> {associateDisplayName(associate)}
                </Typography>
                {associate.__kind === 'institutional' && associate.is_company ? (
                  <Typography variant="body1">
                    <strong>Representante:</strong> {institutionalReceiverName(associate)}
                  </Typography>
                ) : null}
                <Typography variant="body1">
                  <strong>Email:</strong> {clientContactEmail(associate) || '—'}
                </Typography>
                <Typography variant="body1">
                  <strong>Telefone:</strong> {formatPhone(clientContactPhone(associate))}
                </Typography>
                {associate.__kind === 'institutional' ? (
                  <Typography variant="body1">
                    <strong>Documento:</strong>{' '}
                    {associate.is_company
                      ? `CNPJ ${associate.company_cnpj || '—'}`
                      : `CPF ${associate.representative_cpf || '—'}`}
                  </Typography>
                ) : null}
              </Grid>
              <Grid item xs={12} md={5}>
                <Typography variant="h6" gutterBottom>
                  Endereço
                </Typography>
                {deliveryAddr ? (
                  <Typography variant="body1">
                    {deliveryAddr.street}, {deliveryAddr.number}
                    {deliveryAddr.complement ? ` - ${deliveryAddr.complement}` : ''}
                    {' — '}
                    {deliveryAddr.neighborhood} — {deliveryAddr.city} — {deliveryAddr.state} —{' '}
                    {deliveryAddr.cep}
                  </Typography>
                ) : (
                  <>
                    <Typography variant="body1">
                      <strong>Rua:</strong> {associate.street || associate.address?.street || '—'},{' '}
                      {associate.number || associate.street_number || associate.address?.number || ''}
                    </Typography>
                    <Typography variant="body1">
                      <strong>Bairro:</strong> {associate.neighborhood || associate.address?.neighborhood || '—'}
                    </Typography>
                    <Typography variant="body1">
                      <strong>Cidade:</strong> {associate.city || associate.address?.city || '—'} /{' '}
                      {associate.state || associate.address?.state || '—'}
                    </Typography>
                    <Typography variant="body1">
                      <strong>CEP:</strong> {associate.cep || associate.postal_code || associate.address?.cep || '—'}
                    </Typography>
                  </>
                )}
              </Grid>
              <Grid item xs={12} md={3} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {associate.__kind !== 'institutional' && associate.id && !associate.__from_order_stub ? (
                  <>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<EditIcon />}
                  sx={{ backgroundColor: GREEN, color: 'white', '&:hover': { bgcolor: GREEN_HOVER } }}
                  onClick={() => setOpenAddressEdit(true)}
                  data-testid="edit-associate-data"
                >
                  Editar Dados
                </Button>
                {openAddressEdit && (
                  <AddressEditDialog
                    key={associate?.date_updated || associate?.id}
                    open={openAddressEdit}
                    onClose={() => setOpenAddressEdit(false)}
                    user={associate}
                    api={api}
                    onSaved={(newAddress) => {
                      setAssociate((prev) => ({
                        ...prev,
                        street: newAddress.official.street,
                        street_number: newAddress.official.number,
                        number: newAddress.official.number,
                        complement: newAddress.official.complement,
                        neighborhood: newAddress.official.neighborhood,
                        city: newAddress.official.city,
                        state: newAddress.official.state,
                        cep: newAddress.official.cep,
                        delivery_address: newAddress.delivery,
                      }));
                      setSuccess('Dados do associado atualizados');
                      setOpenAddressEdit(false);
                    }}
                  />
                )}
                <DatePrescriptionEdit
                  user={associate}
                  api={api}
                  onDateSaved={(date) => {
                    setAssociate((prev) => ({ ...prev, date_prescription: date || null }));
                    setSuccess(date ? 'Data da prescrição atualizada' : 'Data da prescrição removida');
                  }}
                />
                  </>
                ) : null}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PersonIcon />}
                  sx={{ backgroundColor: GREEN, color: 'white', '&:hover': { bgcolor: GREEN_HOVER } }}
                  onClick={() => {
                    if (associate.__kind === 'institutional') {
                      window.open(
                        `${window.location.origin}${PATHS.institutionalClients}?ic=${encodeURIComponent(associate.client_code || '')}`,
                        '_blank'
                      );
                      return;
                    }
                    window.open(
                      `${window.location.origin}${PATHS.registration}?a=${encodeURIComponent(associate.user_code || '')}`,
                      '_blank'
                    );
                  }}
                >
                  {associate.__kind === 'institutional' ? 'Ver Cliente' : 'Ver Associado'}
                </Button>
              </Grid>
              <Grid
                container
                justifyContent="center"
                alignItems="center"
                sx={{
                  mt: 3,
                  ml: 2,
                  bgcolor: rx.ok ? GREEN : 'red',
                  borderRadius: 2,
                  p: 1,
                  width: '100%',
                }}
              >
                <Typography variant="body1" sx={{ color: 'white', fontWeight: 500 }}>
                  {associate.__kind === 'institutional' ? (
                    <strong>{rx.label}</strong>
                  ) : (
                    <>
                      <strong>Data da Prescrição:</strong> {rx.label}
                    </>
                  )}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Split 7/5 — só com associado (ou após fechar modal se já tiver) */}
        {associateReady && (
          <Grid container spacing={2}>
            {/* ESQUERDA: carrinho + checkout + histórico */}
            <Grid item xs={12} md={7}>
              <Table className="pageContainerTable" sx={{ ml: '20px', width: 'calc(100% - 20px)' }}>
                <TableHead sx={{ bgcolor: GREEN }}>
                  <TableRow>
                    {['#', 'Produto', 'Estoque', 'Qnt', 'Preço', 'Excluir'].map((h) => (
                      <TableCell key={h} sx={headCell}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        Selecione um produto
                      </TableCell>
                    </TableRow>
                  )}
                  {catalogSource !== 'soucannabis' && zeroStockItems.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 1 }}>
                        <Alert severity="warning" sx={{ py: 0 }}>
                          Pedido com estoque 0: {zeroStockItems.map((it) => it.name || it.code).join(', ')}
                        </Alert>
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((it, idx) => {
                    const stock = stockForItem(it);
                    const zero = stock != null && stock <= 0;
                    return (
                    <TableRow key={`${it.code}-${idx}`} sx={{ bgcolor: ZEBRA }}>
                      <TableCell align="center" sx={{ fontSize: 18 }}>
                        {idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontSize: 18 }}>{it.name}</TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: zero ? '#c62828' : GREEN,
                        }}
                      >
                        {stock != null ? stock : '—'}
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          size="small"
                          type="number"
                          data-testid={`item-qty-${idx}`}
                          value={it.quantity}
                          onChange={(e) => updateItemQty(idx, e.target.value)}
                          inputProps={{ min: 1, style: { textAlign: 'center', width: 56 } }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: 18, whiteSpace: 'nowrap' }}>
                        R${Number(it.amount).toFixed(2)}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton color="error" onClick={() => removeItem(idx)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    );
                  })}

                  {/* Desconto + Doação */}
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', py: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="Desconto (R$)"
                          data-testid="discount"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                          sx={{ width: 160 }}
                          inputProps={{ min: 0, step: '0.01' }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Doação (R$)"
                          data-testid="donation"
                          value={donation}
                          onChange={(e) => setDonation(e.target.value)}
                          sx={{ width: 160 }}
                          inputProps={{ min: 0, step: '0.01' }}
                        />
                      </Box>
                    </TableCell>
                  </TableRow>

                  {/* Frete — botão + opções no fim da tabela, acima do total */}
                  {freightQuoteEnabled && (
                    <TableRow data-testid="freight-simulation">
                      <TableCell colSpan={6} align="center" sx={{ py: 1.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LocalShippingOutlinedIcon />}
                            data-testid="quote-freight"
                            onClick={quoteFreight}
                            disabled={freightLoading || items.length === 0}
                            sx={{ borderColor: GREEN, color: GREEN }}
                          >
                            {freightLoading ? 'Calculando…' : 'Calcular frete'}
                          </Button>
                          {freightLoading && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CircularProgress size={18} sx={{ color: '#fff' }} />
                              <Typography variant="body2">Consultando modalidades…</Typography>
                            </Box>
                          )}
                          {freightOptions.length > 0 && (
                            <RadioGroup
                              data-testid="freight-option"
                              value={selectedFreight?.option_key || ''}
                              onChange={(e) => {
                                const opt = freightOptions.find((o) => o.option_key === e.target.value);
                                setSelectedFreight(opt || null);
                              }}
                              sx={{ width: '100%', maxWidth: 720, textAlign: 'left' }}
                            >
                              {freightOptions.map((o) => {
                                const providerLabel =
                                  o.provider === 'loggi'
                                    ? 'Loggi'
                                    : o.provider === 'melhorenvio'
                                      ? 'Melhor Envio'
                                      : o.provider || 'Frete';
                                let service = String(o.service_label || '').trim();
                                if (o.provider === 'loggi') {
                                  service = service.replace(/^Loggi\s+/i, '');
                                }
                                return (
                                  <FormControlLabel
                                    key={o.option_key}
                                    value={o.option_key}
                                    control={<Radio size="small" />}
                                    label={`${providerLabel}${service ? ` · ${service}` : ''} — R$ ${Number(o.price).toFixed(2)}${
                                      o.eta_days != null ? ` · ${o.eta_days} dia(s)` : ''
                                    }`}
                                    sx={{
                                      m: 0.25,
                                      px: 1,
                                      borderRadius: 1,
                                      bgcolor: o.provider === 'loggi' ? '#1262FE22' : '#FFD40033',
                                    }}
                                  />
                                );
                              })}
                            </RadioGroup>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Total */}
                  <TableRow>
                    <TableCell colSpan={4} />
                    <TableCell
                      colSpan={2}
                      sx={{ bgcolor: GREEN, textAlign: 'center', color: '#fff' }}
                    >
                      <Typography>Total:</Typography>
                      <Typography data-testid="cart-total" sx={{ fontWeight: 'bold', fontSize: 18 }}>
                        R${totals.total.toFixed(2)}
                      </Typography>
                      {(totals.discount > 0 || totals.donation > 0 || totals.customSum > 0 || (applyToTotal && totals.freight > 0)) && (
                        <Box sx={{ mt: 1, fontSize: 14 }}>
                          {applyToTotal && totals.freight > 0 && (
                            <span style={{ color: 'white', display: 'block' }}>
                              Frete
                              {selectedFreight?.provider === 'loggi'
                                ? ' Loggi'
                                : selectedFreight?.provider === 'melhorenvio'
                                  ? ' Melhor Envio'
                                  : ''}{' '}
                              R${totals.freight.toFixed(2)}
                            </span>
                          )}
                          {totals.discount > 0 && (
                            <span style={{ color: 'white', display: 'block' }}>
                              Desconto -R${totals.discount.toFixed(2)}
                            </span>
                          )}
                          {totals.donation > 0 && (
                            <span style={{ color: 'white', display: 'block' }}>
                              Doação -R${totals.donation.toFixed(2)}
                            </span>
                          )}
                          {customPayment.map((pay, idx) => (
                            <span key={idx} style={{ color: 'white', display: 'block' }}>
                              {pay.item} -R${Number(pay.value).toFixed(2)}
                            </span>
                          ))}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Info, tags, prescritor, custom pay, frete, criar */}
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ verticalAlign: 'top' }}>
                      <TextField
                        label="Informações do pedido"
                        variant="outlined"
                        fullWidth
                        data-testid="order-info"
                        value={info}
                        onChange={(e) => setInfo(e.target.value)}
                        sx={{ mb: 2 }}
                      />
                      <Autocomplete
                        multiple
                        disableCloseOnSelect
                        options={groupedTagOptions}
                        groupBy={(o) => o.group}
                        getOptionLabel={(o) =>
                          typeof o === 'string' ? o : o.tag || ''
                        }
                        isOptionEqualToValue={(a, b) =>
                          (typeof a === 'string' ? a : a.tag) ===
                          (typeof b === 'string' ? b : b.tag)
                        }
                        value={orderTags.map((t) => ({
                          tag: t,
                          group: scTagOptions.includes(t)
                            ? 'Tags SouCannabis'
                            : 'Tags do sistema',
                        }))}
                        onChange={(_e, v) =>
                          setOrderTags(
                            v.map((x) => (typeof x === 'string' ? x : x.tag)).filter(Boolean)
                          )
                        }
                        freeSolo
                        renderOption={(props, option, { selected }) => (
                          <li {...props}>
                            <Checkbox checked={selected} sx={{ mr: 1 }} readOnly />
                            {typeof option === 'string' ? option : option.tag}
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            variant="outlined"
                            label="Tags do Pedido"
                            placeholder="Selecione as tags..."
                            data-testid="order-tags"
                          />
                        )}
                        sx={{ mb: 2 }}
                      />

                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                        <TextField
                          select
                          size="small"
                          label="Prescritor"
                          data-testid="prescriber-select"
                          value={prescriberCode}
                          onChange={(e) => {
                            const p = professionals.find(
                              (x) => String(x.professional_code || x.id) === e.target.value
                            );
                            setPrescriberCode(e.target.value);
                            setPrescriber(p ? `${p.name || ''} ${p.last_name || ''}`.trim() : '');
                          }}
                          sx={{ minWidth: 280 }}
                        >
                          <MenuItem value="">—</MenuItem>
                          {professionals.map((p) => (
                            <MenuItem key={p.id} value={String(p.professional_code || p.id)}>
                              {p.name} {p.last_name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>

                      <Box sx={{ mt: '24px' }}>
                        <Button
                          variant="text"
                          data-testid="add-custom-payment"
                          sx={{ color: PURPLE, mb: 2, mr: 2 }}
                          onClick={() => setShowCustomPayment((v) => !v)}
                        >
                          Adicionar pagamento personalizado
                        </Button>
                      </Box>
                      {showCustomPayment && (
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <TextField
                            label="Nome da Troca"
                            size="small"
                            value={customPaymentDraft.item}
                            onChange={(e) =>
                              setCustomPaymentDraft((p) => ({ ...p, item: e.target.value }))
                            }
                            sx={{ flex: 1, minWidth: 140 }}
                          />
                          <TextField
                            label="Quantidade"
                            type="number"
                            size="small"
                            value={customPaymentDraft.qnt}
                            onChange={(e) =>
                              setCustomPaymentDraft((p) => ({
                                ...p,
                                qnt: parseInt(e.target.value, 10) || 0,
                              }))
                            }
                            sx={{ width: 110 }}
                          />
                          <TextField
                            label="Valor para descontar"
                            type="number"
                            size="small"
                            value={customPaymentDraft.value}
                            onChange={(e) =>
                              setCustomPaymentDraft((p) => ({
                                ...p,
                                value: Number(e.target.value) || 0,
                              }))
                            }
                            sx={{ width: 140 }}
                          />
                          <Button
                            variant="contained"
                            onClick={handleAddCustomPayment}
                            sx={{ bgcolor: PURPLE, minWidth: 40, '&:hover': { bgcolor: PURPLE_HOVER } }}
                          >
                            <SaveIcon />
                          </Button>
                        </Box>
                      )}
                      {customPayment.length > 0 && (
                        <Box sx={{ mb: 2, textAlign: 'left' }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                            Pagamentos personalizados salvos:
                          </Typography>
                          {customPayment.map((pay, idx) => (
                            <Box
                              key={idx}
                              data-testid={`custom-payment-${idx}`}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                mb: 1,
                                pl: 1,
                                background: '#f5f5f5',
                                borderRadius: 1,
                              }}
                            >
                              <Typography sx={{ flex: 1 }}>
                                {pay.item} | Qnt: {pay.qnt} | Valor: R${Number(pay.value).toFixed(2)}
                              </Typography>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setCustomPayment((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))}
                        </Box>
                      )}

                      <Button
                        variant="contained"
                        data-testid="submit-order"
                        disabled={!canSubmitOrder}
                        onClick={() => submitOrder()}
                        startIcon={
                          submitting ? (
                            <CircularProgress size={20} sx={{ color: 'white' }} />
                          ) : editingOrderId ? (
                            <EditIcon />
                          ) : (
                            <AddShoppingCartOutlinedIcon />
                          )
                        }
                        sx={{
                          backgroundColor: !canSubmitOrder ? '#ccc' : GREEN,
                          color: 'white',
                          mt: '25px',
                          '&:hover': { bgcolor: !canSubmitOrder ? '#ccc' : GREEN_HOVER },
                        }}
                      >
                        {submitting
                          ? editingOrderId
                            ? 'Alterando pedido...'
                            : 'Criando pedido...'
                          : editingOrderId
                            ? 'Alterar Pedido'
                            : 'Criar Pedido'}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Histórico */}
              {history.length > 0 && (
                <Box
                  className="pageContainerTable"
                  data-testid="order-history"
                  sx={{ mt: '30px', ml: '20px', width: 'calc(100% - 20px)' }}
                >
                  <Typography variant="h6" gutterBottom sx={{ textAlign: 'center', p: '10px' }}>
                    Histórico de Pedidos
                  </Typography>
                  <Table>
                    <TableHead sx={{ bgcolor: GREEN }}>
                      <TableRow>
                        {['Data', 'Status', 'Total', ''].map((h) => (
                          <TableCell key={h || 'a'} sx={{ ...headCell, fontSize: 14 }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.slice(0, 15).map((o) => {
                        const pill = statusPill(o.status);
                        return (
                          <TableRow key={o.id} sx={{ bgcolor: ZEBRA }}>
                            <TableCell>
                              {o.date_created
                                ? new Date(o.date_created).toLocaleDateString('pt-BR')
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <Box
                                component="span"
                                sx={{
                                  px: 1,
                                  py: 0.25,
                                  borderRadius: 1,
                                  bgcolor: pill.bg,
                                  color: pill.color,
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                {o.status || '—'}
                              </Box>
                            </TableCell>
                            <TableCell>R$ {Number(o.total || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => applyOrderToCart(o, { asEdit: false })}
                                sx={{ borderColor: GREEN, color: GREEN }}
                              >
                                Comprar Novamente
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Grid>

            {/* DIREITA: catálogo */}
            <Grid item xs={12} md={5}>
              <Box
                className="pageContainerOptions"
                sx={{
                  height: 600,
                  overflowX: 'hidden',
                  overflowY: 'auto',
                  ml: '20px',
                  mr: 2,
                  mb: '20px',
                  py: '25px !important',
                }}
              >
                {productsLoading ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1.5,
                      height: '100%',
                      minHeight: 280,
                    }}
                  >
                    <CircularProgress size={40} sx={{ color: '#fff' }} />
                    <Typography variant="body2" sx={{ color: GREEN, fontWeight: 600 }}>
                      Carregando produtos...
                    </Typography>
                  </Box>
                ) : (
                  <>
                    {catalogSource === 'soucannabis' && (
                      <Chip
                        label="Catálogo SouCannabis"
                        color="success"
                        size="small"
                        data-testid="sc-catalog-badge"
                        sx={{ mb: 1.5 }}
                      />
                    )}
                    <TextField
                      label="Filtrar por nome"
                      variant="outlined"
                      fullWidth
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      sx={{ mb: 2 }}
                    />
                    <Table
                      size="small"
                      sx={{
                        width: '100%',
                        tableLayout: 'fixed',
                        borderCollapse: 'separate',
                        borderSpacing: 0,
                        '& .MuiTableCell-root': {
                          borderColor: 'rgba(49, 67, 51, 0.08)',
                          py: 1.1,
                          px: 1,
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow
                          sx={{
                            bgcolor: GREEN,
                            '& .MuiTableCell-root': {
                              borderBottom: 'none',
                              py: 1.25,
                            },
                          }}
                        >
                          {(catalogSource === 'soucannabis'
                            ? [
                                { key: 'nome', label: 'Produto', align: 'left' },
                                { key: 'preco', label: 'Preço', align: 'right' },
                                { key: 'qnt', label: 'Qtd', align: 'center' },
                                { key: 'add', label: '', align: 'center' },
                              ]
                            : [
                                { key: 'nome', label: 'Produto', align: 'left' },
                                { key: 'preco', label: 'Preço', align: 'right' },
                                { key: 'estoque', label: 'Estoque', align: 'center' },
                                { key: 'qnt', label: 'Qtd', align: 'center' },
                                { key: 'add', label: '', align: 'center' },
                              ]
                          ).map((h) => (
                            <TableCell
                              key={h.key}
                              align={h.align}
                              sx={{
                                ...headCell,
                                textAlign: h.align,
                                fontSize: 13,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                borderBottom: 'none',
                                width:
                                  h.key === 'nome'
                                    ? 'auto'
                                    : h.key === 'preco'
                                      ? '22%'
                                      : h.key === 'estoque'
                                        ? '16%'
                                        : h.key === 'qnt'
                                          ? '14%'
                                          : '12%',
                              }}
                            >
                              {h.label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredProducts.map((p, idx) => {
                          const key = p.sku || String(p.id);
                          const stock = Number(p.amount);
                          const zero =
                            catalogSource !== 'soucannabis' &&
                            Number.isFinite(stock) &&
                            stock <= 0;
                          const sku = p.sku || p.code || '';
                          return (
                            <TableRow
                              key={p.id}
                              sx={{
                                bgcolor: idx % 2 === 0 ? '#fff' : 'rgba(243, 243, 243, 0.85)',
                                transition: 'background-color 0.15s ease',
                                '&:hover': { bgcolor: 'rgba(90, 122, 91, 0.08)' },
                              }}
                            >
                              <TableCell
                                sx={{
                                  textAlign: 'left',
                                  verticalAlign: 'middle',
                                  overflow: 'hidden',
                                }}
                              >
                                <Typography
                                  component="div"
                                  sx={{
                                    fontWeight: 650,
                                    fontSize: 14,
                                    lineHeight: 1.3,
                                    color: '#243126',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={p.name}
                                >
                                  {p.name}
                                </Typography>
                                {sku ? (
                                  <Typography
                                    component="div"
                                    sx={{
                                      mt: 0.25,
                                      fontSize: 11.5,
                                      color: '#6b7a6d',
                                      letterSpacing: '0.02em',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={sku}
                                  >
                                    {sku}
                                  </Typography>
                                ) : null}
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  verticalAlign: 'middle',
                                  whiteSpace: 'nowrap',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: 700,
                                  fontSize: 14,
                                  color: '#314a34',
                                }}
                              >
                                R$&nbsp;{Number(p.price || 0).toFixed(2)}
                              </TableCell>
                              {catalogSource !== 'soucannabis' && (
                                <TableCell
                                  align="center"
                                  sx={{ verticalAlign: 'middle' }}
                                >
                                  <Box
                                    component="span"
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: 36,
                                      px: 1,
                                      py: 0.35,
                                      borderRadius: 999,
                                      fontSize: 12.5,
                                      fontWeight: 700,
                                      fontVariantNumeric: 'tabular-nums',
                                      bgcolor: zero ? 'rgba(198, 40, 40, 0.1)' : 'rgba(90, 122, 91, 0.12)',
                                      color: zero ? '#c62828' : '#314a34',
                                    }}
                                  >
                                    {Number.isFinite(stock) ? stock : '—'}
                                  </Box>
                                </TableCell>
                              )}
                              <TableCell align="center" sx={{ verticalAlign: 'middle' }}>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={qtyBySku[key] || 1}
                                  onChange={(e) =>
                                    setQtyBySku((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  aria-label={`Quantidade ${p.name}`}
                                  style={{
                                    padding: '6px 4px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(49, 67, 51, 0.18)',
                                    width: '100%',
                                    maxWidth: 52,
                                    boxSizing: 'border-box',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    background: '#fff',
                                  }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ verticalAlign: 'middle' }}>
                                <Button
                                  variant="contained"
                                  data-testid={`product-${p.id}`}
                                  onClick={() => addProduct(p)}
                                  aria-label={`Adicionar ${p.name}`}
                                  sx={{
                                    bgcolor: zero ? '#c62828' : GREEN,
                                    minWidth: 40,
                                    width: 40,
                                    height: 40,
                                    p: 0,
                                    borderRadius: 2,
                                    boxShadow: 'none',
                                    '&:hover': {
                                      bgcolor: zero ? '#a31f1f' : PURPLE_HOVER,
                                      boxShadow: 'none',
                                    },
                                  }}
                                >
                                  <AddShoppingCartOutlinedIcon sx={{ fontSize: 20 }} />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {/* hidden helper for e2e that used manual item */}
                    <Button
                      sx={{ display: 'none' }}
                      data-testid="add-manual-item"
                      onClick={() =>
                        setItems((prev) => [
                          ...prev,
                          { code: 'manual', name: 'Item manual', amount: 10, quantity: 1 },
                        ])
                      }
                    />
                    <Button
                      sx={{ display: 'none' }}
                      data-testid="submit-wrong-total"
                      onClick={() => submitOrder({ forceWrongTotal: true })}
                    />
                  </>
                )}
              </Box>
            </Grid>
          </Grid>
        )}
          </>
        )}
      </Box>
    </ThemeProvider>
  );
}
