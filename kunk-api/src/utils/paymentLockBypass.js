'use strict';

/** HTTP flags only skip PAYMENT_LOCK when the API is running tests. */
function skipPaymentLockFromBody(body, nodeEnv) {
  const requested =
    body?.skip_payment_lock === true ||
    body?.force_test_paid === true ||
    body?.test_bypass_payment_lock === true;
  return Boolean(requested && nodeEnv === 'test');
}

module.exports = { skipPaymentLockFromBody };
