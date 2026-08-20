import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  originsFromEnv,
  resolveReturnUrl,
  resolveReturnUrlFromSearch,
} from './returnUrl.js';

const REGISTRATION = 'http://localhost:4255';
const KUNK = 'http://localhost:4257';
const env = {
  VITE_REGISTRATION_URL: REGISTRATION,
  VITE_KUNK_URL: KUNK,
};

describe('returnUrl', () => {
  const allowedOrigins = originsFromEnv(env);
  const opts = { allowedOrigins, registrationOrigin: REGISTRATION };

  it('collects unique origins from env', () => {
    assert.deepEqual(allowedOrigins, [REGISTRATION, KUNK]);
  });

  it('allows the registration origin', () => {
    assert.equal(
      resolveReturnUrl(`${REGISTRATION}/finalizar?signed=1`, opts),
      `${REGISTRATION}/finalizar?signed=1`
    );
  });

  it('allows the kunk origin when configured', () => {
    assert.equal(resolveReturnUrl(`${KUNK}/associados`, opts), `${KUNK}/associados`);
  });

  it('resolves a relative path against registration', () => {
    assert.equal(
      resolveReturnUrl('/finalizar?signed=1', opts),
      `${REGISTRATION}/finalizar?signed=1`
    );
  });

  it('rejects an external site', () => {
    assert.equal(resolveReturnUrl('https://evil.tld/phish', opts), null);
  });

  it('rejects protocol-relative URLs', () => {
    assert.equal(resolveReturnUrl('//evil.tld/phish', opts), null);
  });

  it('rejects lookalike hosts', () => {
    assert.equal(resolveReturnUrl('https://localhost.evil.com/finalizar', opts), null);
    assert.equal(resolveReturnUrl('http://localhost:4255.evil.tld/', opts), null);
  });

  it('rejects javascript: and userinfo spoof', () => {
    assert.equal(resolveReturnUrl('javascript:alert(1)', opts), null);
    assert.equal(resolveReturnUrl('https://localhost:4255@evil.tld/', opts), null);
  });

  it('fails closed without configured origins', () => {
    assert.equal(resolveReturnUrl(`${REGISTRATION}/finalizar`, { allowedOrigins: [] }), null);
    assert.equal(
      resolveReturnUrl('/finalizar', { allowedOrigins: [], registrationOrigin: null }),
      null
    );
  });

  it('reads return_url from the query string', () => {
    assert.equal(
      resolveReturnUrlFromSearch(`?return_url=${encodeURIComponent(`${REGISTRATION}/finalizar?signed=1`)}`, env),
      `${REGISTRATION}/finalizar?signed=1`
    );
    assert.equal(
      resolveReturnUrlFromSearch('?return_url=https://evil.tld/', env),
      null
    );
  });
});
