'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeExpectedTotal,
  assertTotalMatch,
  productsSubtotal,
} = require('../../src/services/orderTotals');

describe('orderTotals', () => {
  it('products = amount × quantity', () => {
    assert.equal(
      productsSubtotal([
        { amount: 10, quantity: 2 },
        { amount: 5.5, quantity: 1 },
      ]),
      25.5
    );
  });

  it('formula with freight discount donation custom_payment', () => {
    const r = computeExpectedTotal({
      items: [{ amount: 100, quantity: 1 }],
      delivery_price: 20,
      apply_to_total: true,
      discount: 10,
      donation: 5,
      custom_payment: [{ value: 5 }],
    });
    // 100 + 20 - 10 - 5 - 5 = 100
    assert.equal(r.expected_total, 100);
    assert.equal(r.discount_effective, 15);
  });

  it('custom_payment object (legado) is ignored, not thrown', () => {
    const r = computeExpectedTotal({
      items: [{ amount: 100, quantity: 1 }],
      delivery_price: 0,
      discount: 0,
      donation: 0,
      custom_payment: { method: 'pix', gateway: 'demo' },
    });
    assert.equal(r.expected_total, 100);
    assert.equal(r.discount_effective, 0);
  });

  it('apply_to_total false ignores freight', () => {
    const r = computeExpectedTotal({
      items: [{ amount: 50, quantity: 1 }],
      delivery_price: 20,
      apply_to_total: false,
    });
    assert.equal(r.expected_total, 50);
    assert.equal(r.freight, 0);
  });

  it('assertTotalMatch throws TOTAL_MISMATCH', () => {
    assert.throws(() => assertTotalMatch(10, 11), (err) => err.code === 'TOTAL_MISMATCH');
  });
});
