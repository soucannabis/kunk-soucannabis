'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { skipPaymentLockFromBody } = require('../../src/utils/paymentLockBypass');

describe('skipPaymentLockFromBody', () => {
  it('is false without flags', () => {
    assert.equal(skipPaymentLockFromBody({}, 'test'), false);
    assert.equal(skipPaymentLockFromBody({ status: 'Pagamento concluído' }, 'test'), false);
  });

  it('honors flags only when NODE_ENV is test', () => {
    const flags = { skip_payment_lock: true };
    assert.equal(skipPaymentLockFromBody(flags, 'test'), true);
    assert.equal(skipPaymentLockFromBody({ force_test_paid: true }, 'test'), true);
    assert.equal(skipPaymentLockFromBody({ test_bypass_payment_lock: true }, 'test'), true);
    assert.equal(skipPaymentLockFromBody(flags, 'production'), false);
    assert.equal(skipPaymentLockFromBody(flags, 'development'), false);
  });
});
