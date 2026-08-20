'use strict';

const { AppError } = require('../../utils/response');

/** Aceita apenas inteiro 0–100 (number ou string "8"). Rejeita "8.0" / 8.5. */
function assertIntegerPercentage(raw) {
  if (raw === undefined || raw === null || raw === '') {
    throw new AppError(400, 'PAYMENT_PERCENTAGE_NOT_INTEGER', 'payment_percentage não configurado');
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!/^\d{1,3}$/.test(s)) {
      throw new AppError(
        400,
        'PAYMENT_PERCENTAGE_NOT_INTEGER',
        'payment_percentage deve ser um inteiro entre 0 e 100'
      );
    }
    const n = Number(s);
    if (n < 0 || n > 100) {
      throw new AppError(
        400,
        'PAYMENT_PERCENTAGE_NOT_INTEGER',
        'payment_percentage deve ser um inteiro entre 0 e 100'
      );
    }
    return n;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
    throw new AppError(
      400,
      'PAYMENT_PERCENTAGE_NOT_INTEGER',
      'payment_percentage deve ser um inteiro entre 0 e 100'
    );
  }
  return n;
}

function isIntegerPercentage(raw) {
  try {
    assertIntegerPercentage(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Monta rules de split type=percentage.
 * Associação liable + taxas; SC sem responsabilidade.
 */
function buildSplitRules({ paymentPercentage, soucannabisRecipientId, associationRecipientId }) {
  const pct = assertIntegerPercentage(paymentPercentage);
  if (!soucannabisRecipientId) {
    throw new AppError(400, 'SPLIT_NOT_CONFIGURED', 'soucannabis_recipient_id ausente');
  }
  if (!associationRecipientId) {
    throw new AppError(400, 'SPLIT_NOT_CONFIGURED', 'association_recipient_id ausente');
  }
  const assocPct = 100 - pct;
  return [
    {
      amount: pct,
      type: 'percentage',
      recipient_id: soucannabisRecipientId,
      options: {
        liable: false,
        charge_processing_fee: false,
        charge_remainder_fee: false,
      },
    },
    {
      amount: assocPct,
      type: 'percentage',
      recipient_id: associationRecipientId,
      options: {
        liable: true,
        charge_processing_fee: true,
        charge_remainder_fee: true,
      },
    },
  ];
}

/**
 * Percentual SC → valores em centavos/reais (resto para a associação).
 * totalCents = round(total * 100); sc = round(totalCents * pct / 100); assoc = remainder.
 */
function splitAmountsFromTotal(totalReais, paymentPercentage) {
  const pct = assertIntegerPercentage(paymentPercentage);
  const totalCents = Math.max(0, Math.round(Number(totalReais || 0) * 100));
  const scCents = Math.round((totalCents * pct) / 100);
  const assocCents = totalCents - scCents;
  return {
    total_cents: totalCents,
    total_reais: totalCents / 100,
    soucannabis: {
      percentage: pct,
      amount_cents: scCents,
      amount_reais: scCents / 100,
    },
    association: {
      percentage: 100 - pct,
      amount_cents: assocCents,
      amount_reais: assocCents / 100,
    },
  };
}

module.exports = {
  assertIntegerPercentage,
  isIntegerPercentage,
  buildSplitRules,
  splitAmountsFromTotal,
};
