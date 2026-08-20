'use strict';

const client = require('./client');
const { getPagarmeConfig } = require('./config');
const { buildSplitRules, assertIntegerPercentage } = require('./split');
const { probePsp } = require('./probePsp');
const { AppError } = require('../../utils/response');
const itemsRepository = require('../../repositories/itemsRepository');
const { isModuleEnabled } = require('../moduleFlags');
const systemConfigService = require('../systemConfigService');
const { env } = require('../../config/env');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function separatePhone(phoneNumber) {
  let digits = onlyDigits(phoneNumber);
  if (digits.length >= 12 && digits.startsWith('55')) {
    // keep
  } else if (digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  const m = digits.match(/^(\d{2})(\d{2})(\d{8,9})$/);
  if (!m) return { country_code: '55', area_code: '11', number: '999999999' };
  return { country_code: m[1], area_code: m[2], number: m[3] };
}

function billingAddressFromUser(user) {
  let address = user.address_delivery || null;
  if (typeof address === 'string') {
    try {
      address = JSON.parse(address);
    } catch {
      address = null;
    }
  }
  const src =
    address && address.street
      ? address
      : {
          street: user.street,
          number: user.number,
          neighborhood: user.neighborhood,
          complement: user.complement,
          city: user.city,
          state: user.state,
          cep: user.cep,
        };
  const line1 = [
    src.street,
    src.number ? `nº ${src.number}` : null,
    src.neighborhood,
    src.complement,
    src.city,
    src.state,
    src.cep,
  ]
    .filter(Boolean)
    .join(' - ');
  return {
    line_1: line1 || 'Endereço não informado',
    zip_code: onlyDigits(src.cep) || '00000000',
    city: src.city || 'São Paulo',
    state: src.state || 'SP',
    country: 'BR',
  };
}

function associateFullName(user) {
  const a = [user.associate_name || user.name_associate, user.associate_last_name || user.lastname_associate]
    .filter(Boolean)
    .join(' ')
    .trim();
  return a || user.name || 'Associado';
}

async function loadUserByCode(userCode) {
  if (!userCode) return null;
  const { query } = require('../../db/pool');
  const res = await query(
    `SELECT * FROM users WHERE user_code::text = $1 OR id::text = $1 LIMIT 1`,
    [String(userCode)]
  );
  return res.rows[0] || null;
}

async function getScPaymentPercentage() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    return resolved.values?.['modules.soucannabis_orders.payment_percentage'];
  } catch {
    return null;
  }
}

async function isSplitMode() {
  const scOn = await isModuleEnabled('soucannabis_orders');
  if (!scOn) return false;
  const cfg = await getPagarmeConfig();
  return Boolean(cfg.enabled && cfg.association_recipient_id && cfg.soucannabis_recipient_id);
}

function paymentLinkBoletoDueIn(checkoutExpiresIn) {
  const minutes = Number(checkoutExpiresIn);
  if (!Number.isFinite(minutes) || minutes <= 0) return 7;
  return Math.max(1, Math.ceil(minutes / (24 * 60)));
}

function buildPaymentLinkBody({
  code,
  context,
  amountCents,
  methods,
  installments,
  checkoutExpiresIn,
}) {
  const accepted = methods.filter((method) => method === 'credit_card' || method === 'boleto');
  const paymentSettings = {
    accepted_payment_methods: accepted.length ? accepted : ['credit_card'],
  };

  if (paymentSettings.accepted_payment_methods.includes('credit_card')) {
    paymentSettings.credit_card_settings = {
      operation_type: 'auth_and_capture',
      installments,
    };
  }
  if (paymentSettings.accepted_payment_methods.includes('boleto')) {
    paymentSettings.boleto_settings = {
      due_in: paymentLinkBoletoDueIn(checkoutExpiresIn),
      instructions: 'Pagamento Associação',
    };
  }

  const expiresIn = Number(checkoutExpiresIn);
  return {
    type: 'order',
    name: `Pagamento ${context} ${code}`,
    order_code: code,
    // Um pagamento por link evita vários pedidos pagos com o mesmo order_code.
    max_paid_sessions: 1,
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expires_in: expiresIn } : {}),
    payment_settings: paymentSettings,
    cart_settings: {
      items: [
        {
          name: 'Pagamento Associação',
          description: `Pagamento ${context} ${code}`,
          amount: amountCents,
          default_quantity: 1,
        },
      ],
    },
  };
}

/**
 * Cria link Pagar.me para order ou service.
 * Standalone usa Payment Links; split SC preserva o checkout em /orders.
 * body: { context, entity_id, methods, amount_override? }
 */
async function createCheckout(body = {}) {
  const context = body.context === 'service' ? 'service' : 'order';
  const entityId = body.entity_id;
  const methods = Array.isArray(body.methods) && body.methods.length ? body.methods : ['credit_card'];
  if (!entityId) throw new AppError(400, 'VALIDATION_ERROR', 'entity_id é obrigatório');

  const cfg = await getPagarmeConfig();
  if (!cfg.enabled) throw new AppError(503, 'MODULE_DISABLED', 'Módulo pagarme não está ativo');

  if (context === 'order' && !cfg.use_for_orders) {
    throw new AppError(403, 'FEATURE_DISABLED', 'Pagar.me desabilitado para pedidos');
  }
  if (context === 'service' && !cfg.use_for_services) {
    throw new AppError(403, 'FEATURE_DISABLED', 'Pagar.me desabilitado para serviços');
  }

  const splitMode = context === 'order' && (await isSplitMode());
  if (splitMode) {
    if (body.amount_override != null && Number(body.amount_override) > 0) {
      // Partial payments not allowed in split mode
      const entity = await itemsRepository.getItem('orders', entityId);
      const total = Number(entity?.total || 0);
      if (Number(body.amount_override) < total) {
        throw new AppError(400, 'PARTIAL_NOT_ALLOWED', 'Cartão parcial não é permitido com Pedidos SouCannabis ativo');
      }
    }
    await probePsp();
  }

  let entity;
  let userCode;
  let code;
  let baseAmount;

  if (context === 'order') {
    entity = await itemsRepository.getItem('orders', entityId);
    if (!entity) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
    userCode = entity.user_code;
    code = String(entity.order_code || entity.id);
    baseAmount = body.amount_override != null ? Number(body.amount_override) : Number(entity.total || 0);
  } else {
    entity = await itemsRepository.getItem('services', entityId);
    if (!entity) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');
    userCode = entity.associate || entity.associate_user_code || entity.user_code;
    code = String(entity.service_code || entity.booking_group_code || entity.id);
    baseAmount =
      body.amount_override != null
        ? Number(body.amount_override)
        : Number(entity.price_paid || entity.price || 0);
  }

  if (!(baseAmount > 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Valor do pagamento deve ser maior que zero');
  }

  const user = await loadUserByCode(userCode);
  if (!user) throw new AppError(400, 'VALIDATION_ERROR', 'Associado do pedido/serviço não encontrado');

  const useCard = methods.includes('credit_card');
  const useBoleto = methods.includes('boleto');
  const feeMult = 1 + (cfg.card_fee_percent || 0) / 100;
  // Boleto: without fee; card-only: with fee; both: charge with fee (card path)
  const amountReais = useBoleto && !useCard ? Math.ceil(baseAmount) : Math.ceil(baseAmount * feeMult);
  const amountCents = Math.max(1, Math.round(amountReais * 100));

  const phone = separatePhone(user.mobile_number || user.phone);
  const billing = billingAddressFromUser(user);
  const fullName = associateFullName(user);
  const email = user.email_account || 'noreply@example.com';

  const installments =
    amountReais > 600
      ? [1, 2, 3, 4, 5].map((n) => ({ number: n, total: amountCents }))
      : [1, 2, 3].map((n) => ({ number: n, total: amountCents }));

  let splitRules = null;
  if (splitMode) {
    const pct = assertIntegerPercentage(await getScPaymentPercentage());
    splitRules = buildSplitRules({
      paymentPercentage: pct,
      soucannabisRecipientId: cfg.soucannabis_recipient_id,
      associationRecipientId: cfg.association_recipient_id,
    });
  }

  let pagarme;
  let paymentUrl = null;
  let paymentCode = null;

  if (splitMode) {
    const accepted = methods.filter((method) => method === 'credit_card' || method === 'boleto');
    const payment = {
      amount: amountCents,
      payment_method: 'checkout',
      checkout: {
        expires_in: cfg.checkout_expires_in || 10080,
        billing_address_editable: false,
        billing_address: billing,
        customer_editable: true,
        accepted_payment_methods: accepted.length ? accepted : ['credit_card'],
        success_url: cfg.success_url || env.publicUrls.kunk,
        boleto: {
          due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        },
        credit_card: { installments },
      },
      split: splitRules,
    };
    const requestBody = {
      code,
      customer: {
        name: fullName,
        email,
        phones: {
          mobile_phone: {
            country_code: phone.country_code,
            area_code: phone.area_code,
            number: phone.number,
          },
        },
      },
      items: [
        {
          amount: amountCents,
          quantity: 1,
          code: 'SC-ORDER',
          name: 'Pagamento Associação',
          description: `Pagamento ${context} ${code}`,
          category: 'payment',
        },
      ],
      payments: [payment],
    };
    pagarme = await client.request('/orders', { method: 'POST', body: requestBody });
    paymentUrl = pagarme?.checkouts?.[0]?.payment_url || null;
    paymentCode =
      pagarme?.charges?.[0]?.last_transaction?.qr_code ||
      pagarme?.charges?.[0]?.last_transaction?.qr_code_url ||
      null;
  } else {
    const requestBody = buildPaymentLinkBody({
      code,
      context,
      amountCents,
      methods,
      installments,
      checkoutExpiresIn: cfg.checkout_expires_in,
    });
    pagarme = await client.request('/paymentlinks', {
      method: 'POST',
      body: requestBody,
      apiBase: await client.paymentLinksApiBase(),
    });
    paymentUrl = pagarme?.url || null;
  }

  const patch = {};
  if (paymentUrl) patch.payment_link = paymentUrl;
  if (paymentCode) patch.payment_code = paymentCode;

  if (Object.keys(patch).length) {
    await itemsRepository.updateItem(context === 'order' ? 'orders' : 'services', entityId, patch);
  }

  return {
    pagarme,
    payment_link: paymentUrl,
    payment_code: paymentCode,
    code,
    split_mode: splitMode,
    split: splitRules,
    amount_cents: amountCents,
    upstream: splitMode ? 'orders' : 'paymentlinks',
  };
}

module.exports = {
  createCheckout,
  isSplitMode,
  getScPaymentPercentage,
  loadUserByCode,
  associateFullName,
  buildPaymentLinkBody,
  paymentLinkBoletoDueIn,
};
