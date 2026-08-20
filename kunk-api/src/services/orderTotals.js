'use strict';

/**
 * Pure order total helpers (no I/O).
 */

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function productsSubtotal(items = []) {
  return roundMoney(
    (items || []).reduce((sum, item) => {
      const amount = Number(item?.amount) || 0;
      const qty = Number(item?.quantity) || 0;
      return sum + amount * qty;
    }, 0)
  );
}

function customPaymentSum(customPayment = []) {
  // Pedidos legados/sample podem ter custom_payment como objeto { method, gateway }
  // em vez de array de linhas { item, qnt, value }.
  const rows = Array.isArray(customPayment) ? customPayment : [];
  return roundMoney(rows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0));
}

/**
 * @param {object} input
 * @param {Array} input.items
 * @param {number} [input.delivery_price]
 * @param {boolean} [input.apply_to_total]
 * @param {number} [input.discount]
 * @param {number} [input.donation]
 * @param {Array} [input.custom_payment]
 */
function computeExpectedTotal(input = {}) {
  const products = productsSubtotal(input.items);
  const freight = input.apply_to_total === false ? 0 : roundMoney(input.delivery_price || 0);
  const discount = roundMoney(input.discount || 0);
  const donation = roundMoney(input.donation || 0);
  const discountEffective = roundMoney(discount + customPaymentSum(input.custom_payment));
  const expected = roundMoney(Math.max(0, products + freight - discountEffective - donation));
  return {
    products,
    freight,
    discount,
    donation,
    discount_effective: discountEffective,
    expected_total: expected,
  };
}

function assertTotalMatch(clientTotal, expectedTotal, details = {}) {
  const client = roundMoney(clientTotal);
  const expected = roundMoney(expectedTotal);
  if (Math.abs(client - expected) > 0.01) {
    const err = new Error(
      `Total informado (${client}) diverge do calculado (${expected})`
    );
    err.code = 'TOTAL_MISMATCH';
    err.details = { client_total: client, expected_total: expected, ...details };
    throw err;
  }
  return expected;
}

module.exports = {
  roundMoney,
  productsSubtotal,
  customPaymentSum,
  computeExpectedTotal,
  assertTotalMatch,
};
