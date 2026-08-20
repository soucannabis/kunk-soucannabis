'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  createOAuthState,
  assertOAuthState,
  _resetOAuthStateForTests,
} = require('../../src/services/oauthState');
const { AppError } = require('../../src/utils/response');

describe('oauthState', () => {
  const prevKey = process.env.CONFIG_ENCRYPT_KEY;

  before(() => {
    process.env.CONFIG_ENCRYPT_KEY =
      process.env.CONFIG_ENCRYPT_KEY || '0123456789abcdef0123456789abcdef';
    _resetOAuthStateForTests();
  });

  after(() => {
    if (prevKey === undefined) delete process.env.CONFIG_ENCRYPT_KEY;
    else process.env.CONFIG_ENCRYPT_KEY = prevKey;
    _resetOAuthStateForTests();
  });

  it('accepts a fresh state for the same service once', () => {
    const state = createOAuthState('google_calendar');
    assert.ok(state.includes('.'));
    assert.doesNotThrow(() => assertOAuthState('google_calendar', state));
    assert.throws(
      () => assertOAuthState('google_calendar', state),
      (err) => err instanceof AppError && err.code === 'OAUTH_STATE_INVALID'
    );
  });

  it('rejects missing, tampered, and cross-service state', () => {
    assert.throws(() => assertOAuthState('melhorenvio', ''), (err) => err.code === 'OAUTH_STATE_INVALID');
    const state = createOAuthState('melhorenvio');
    assert.throws(
      () => assertOAuthState('google_calendar', state),
      (err) => err.code === 'OAUTH_STATE_INVALID'
    );
    const tampered = `${state.slice(0, -2)}aa`;
    assert.throws(
      () => assertOAuthState('melhorenvio', tampered),
      (err) => err.code === 'OAUTH_STATE_INVALID'
    );
  });
});
