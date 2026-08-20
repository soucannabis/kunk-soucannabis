'use strict';

const systemConfigService = require('../systemConfigService');
const storeFreightConfig = require('../storeFreightConfig');
const pagarmeClient = require('../pagarme/client');
const { getPagarmeConfig } = require('../pagarme/config');
const { assertIntegerPercentage, buildSplitRules, splitAmountsFromTotal } = require('../pagarme/split');
const { getScConfig } = require('./config');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Dados da associação (app externo) para exibir no pedido SC.
 */
async function loadAssociationSnapshot() {
  let name = process.env.ASSOCIATION_NAME || process.env.VITE_ASSOCIATION_NAME || null;
  try {
    const { values } = await systemConfigService.resolveAll('registration');
    name = values?.['VITE_ASSOCIATION_NAME'] || values?.association_name || name;
  } catch {
    /* keep env */
  }

  let shipFrom = null;
  try {
    const cfg = await storeFreightConfig.getStoreFreightConfig();
    shipFrom = cfg.ship_from;
  } catch {
    shipFrom = null;
  }

  if (!name && shipFrom?.name) name = shipFrom.name;

  const address = shipFrom
    ? {
        street: shipFrom.street || '',
        number: shipFrom.number || '',
        complement: shipFrom.complement || '',
        neighborhood: shipFrom.neighborhood || '',
        city: shipFrom.city || '',
        state: shipFrom.state || '',
        cep: shipFrom.cep || '',
      }
    : null;

  return {
    name: name || null,
    document: shipFrom?.document ? onlyDigits(shipFrom.document) : null,
    phone: shipFrom?.phone ? String(shipFrom.phone) : null,
    email: shipFrom?.email || null,
    address,
  };
}

async function fetchRecipientSafe(recipientId) {
  if (!recipientId) return null;
  try {
    return await pagarmeClient.request(`/recipients/${encodeURIComponent(recipientId)}`);
  } catch {
    return { id: String(recipientId), fetch_error: true };
  }
}

function roleForRecipientId(recipientId, pagarmeCfg) {
  const id = String(recipientId || '');
  if (id && id === String(pagarmeCfg.soucannabis_recipient_id || '')) return 'soucannabis';
  if (id && id === String(pagarmeCfg.association_recipient_id || '')) return 'association';
  return 'other';
}

/**
 * Enriquece external_payment_info com associação + split (% e R$) + recipients completos.
 */
async function enrichExternalPaymentInfo(order, baseInfo = null) {
  const orderTotal = Number(order?.total || 0);
  const sc = await getScConfig();
  const pagarme = await getPagarmeConfig();
  const association = await loadAssociationSnapshot();

  let info =
    baseInfo && typeof baseInfo === 'object' && !Array.isArray(baseInfo)
      ? { ...baseInfo }
      : order?.external_payment_info && typeof order.external_payment_info === 'object'
        ? { ...order.external_payment_info }
        : {};

  info.association = association;
  info.local_order_id = order?.id ?? info.local_order_id ?? null;
  info.local_order_code = String(order?.order_code || order?.id || info.local_order_code || '');
  info.amount_reais = orderTotal;
  info.amount_cents = Math.max(0, Math.round(orderTotal * 100));

  let pct = null;
  try {
    if (sc.payment_percentage != null && sc.payment_percentage !== '') {
      pct = assertIntegerPercentage(sc.payment_percentage);
    } else if (info.payment_percentage != null && info.payment_percentage !== '') {
      pct = assertIntegerPercentage(info.payment_percentage);
    }
  } catch {
    pct = null;
  }

  const canSplit =
    pct != null &&
    pagarme.soucannabis_recipient_id &&
    pagarme.association_recipient_id &&
    orderTotal > 0;

  if (!canSplit) {
    if (!info.provider) {
      info.provider = orderTotal > 0 ? info.provider || 'manual' : 'none';
    }
    return info;
  }

  info.payment_percentage = pct;
  const amounts = splitAmountsFromTotal(orderTotal, pct);
  info.amount_cents = amounts.total_cents;
  info.amount_reais = amounts.total_reais;

  const rules = buildSplitRules({
    paymentPercentage: pct,
    soucannabisRecipientId: pagarme.soucannabis_recipient_id,
    associationRecipientId: pagarme.association_recipient_id,
  });

  const [scRecipient, assocRecipient] = await Promise.all([
    fetchRecipientSafe(pagarme.soucannabis_recipient_id),
    fetchRecipientSafe(pagarme.association_recipient_id),
  ]);

  const byRole = {
    soucannabis: {
      rule: rules[0],
      money: amounts.soucannabis,
      recipient: scRecipient,
    },
    association: {
      rule: rules[1],
      money: amounts.association,
      recipient: assocRecipient,
    },
  };

  // Se já havia split (webhook), preserva options/IDs conhecidos e enriquece.
  const existingSplit = Array.isArray(info.split) ? info.split : null;

  info.split = ['soucannabis', 'association'].map((role) => {
    const { rule, money, recipient } = byRole[role];
    const prev =
      existingSplit?.find((s) => String(s.recipient_id || '') === String(rule.recipient_id)) ||
      existingSplit?.find((s) => s.role === role) ||
      null;
    return {
      role,
      type: 'percentage',
      // `amount` permanece = % (compat Pagarme / leitores antigos)
      amount: money.percentage,
      percentage: money.percentage,
      amount_reais: money.amount_reais,
      amount_cents: money.amount_cents,
      recipient_id: rule.recipient_id,
      options: prev?.options || rule.options,
      recipient: recipient || prev?.recipient || { id: rule.recipient_id },
    };
  });

  // Incluir qualquer recipient extra que já viesse no split anterior
  if (existingSplit) {
    for (const s of existingSplit) {
      const rid = String(s.recipient_id || s.recipient?.id || '');
      if (!rid) continue;
      if (info.split.some((x) => String(x.recipient_id) === rid)) continue;
      const role = roleForRecipientId(rid, pagarme);
      let moneyPct = s.percentage != null ? Number(s.percentage) : Number(s.amount);
      if (!Number.isFinite(moneyPct)) moneyPct = 0;
      const cents =
        s.amount_cents != null
          ? Number(s.amount_cents)
          : Math.round((amounts.total_cents * moneyPct) / 100);
      info.split.push({
        role,
        type: s.type || 'percentage',
        amount: moneyPct,
        percentage: moneyPct,
        amount_reais: s.amount_reais != null ? Number(s.amount_reais) : cents / 100,
        amount_cents: cents,
        recipient_id: rid,
        options: s.options || null,
        recipient: s.recipient || (await fetchRecipientSafe(rid)) || { id: rid },
      });
    }
  }

  info.recipients = info.split.map((s) => ({
    role: s.role,
    recipient_id: s.recipient_id,
    percentage: s.percentage,
    amount_reais: s.amount_reais,
    amount_cents: s.amount_cents,
    ...(s.recipient && typeof s.recipient === 'object' ? s.recipient : { id: s.recipient_id }),
  }));

  return info;
}

module.exports = {
  loadAssociationSnapshot,
  enrichExternalPaymentInfo,
  fetchRecipientSafe,
};
