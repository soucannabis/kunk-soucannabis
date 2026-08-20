'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateOperatorPassword,
  DEFAULT_SUPPORT_EMAIL,
  SUPPORT_INTERNAL_CODE,
} = require('../../src/services/supportCredentialsService');
const { assertOperatorPassword } = require('../../src/repositories/authRepository');

describe('supportCredentialsService', () => {
  it('exposes default email and internal code', () => {
    assert.equal(DEFAULT_SUPPORT_EMAIL, 'support@example.com');
    assert.equal(SUPPORT_INTERNAL_CODE, 'support');
  });

  it('generates passwords that pass operator policy', () => {
    for (let i = 0; i < 10; i++) {
      const password = generateOperatorPassword();
      assert.ok(password.length >= 8);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/);
      assert.doesNotThrow(() => assertOperatorPassword(password));
    }
  });
});
