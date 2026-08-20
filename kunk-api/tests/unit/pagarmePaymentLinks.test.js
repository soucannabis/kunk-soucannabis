'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPaymentLinkBody,
  paymentLinkBoletoDueIn,
} = require('../../src/services/pagarme/orders');
const {
  DEFAULT_API_BASE,
  TEST_API_BASE,
  getPaymentLinksApiBase,
} = require('../../src/services/pagarme/client');

describe('Pagar.me Payment Links', () => {
  it('uses the sandbox endpoint with a test key', () => {
    assert.equal(getPaymentLinksApiBase('sk_test_abc', DEFAULT_API_BASE), TEST_API_BASE);
    assert.equal(
      getPaymentLinksApiBase('sk_live_abc', DEFAULT_API_BASE),
      DEFAULT_API_BASE
    );
  });

  it('converts the configured checkout duration to boleto due_in days', () => {
    assert.equal(paymentLinkBoletoDueIn(10080), 7);
    assert.equal(paymentLinkBoletoDueIn(1), 1);
    assert.equal(paymentLinkBoletoDueIn(null), 7);
  });

  it('creates a standalone link payload with a stable order code', () => {
    const body = buildPaymentLinkBody({
      code: 'ORD-42',
      context: 'order',
      amountCents: 10500,
      methods: ['credit_card', 'boleto'],
      installments: [{ number: 1, total: 10500 }],
      checkoutExpiresIn: 10080,
    });

    assert.equal(body.type, 'order');
    assert.equal(body.order_code, 'ORD-42');
    assert.equal(body.max_paid_sessions, 1);
    assert.equal(body.expires_in, 10080);
    assert.deepEqual(body.payment_settings.accepted_payment_methods, ['credit_card', 'boleto']);
    assert.equal(body.payment_settings.boleto_settings.due_in, 7);
    assert.deepEqual(body.payment_settings.credit_card_settings.installments, [
      { number: 1, total: 10500 },
    ]);
    assert.equal(body.cart_settings.items[0].amount, 10500);
  });
});
