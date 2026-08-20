'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../src/utils/response');
const {
  publicApiBase,
  oauthRedirectUri,
  publicApiUrlFromEnv,
} = require('../../src/utils/publicApiUrl');

describe('publicApiUrl', () => {
  const prevPublic = process.env.PUBLIC_API_URL;
  const prevAlt = process.env.API_PUBLIC_URL;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = prevPublic;
    if (prevAlt === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = prevAlt;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it('uses PUBLIC_API_URL and ignores Host / X-Forwarded-Host', () => {
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_API_URL = 'https://api.associacao.example';
    delete process.env.API_PUBLIC_URL;
    const req = {
      get(name) {
        const h = {
          'x-forwarded-host': 'evil.example',
          'x-original-host': 'evil.example',
          host: 'evil.example',
          'x-forwarded-proto': 'https',
        };
        return h[String(name).toLowerCase()];
      },
      protocol: 'https',
    };
    assert.equal(publicApiUrlFromEnv(), 'https://api.associacao.example');
    assert.equal(publicApiBase(req), 'https://api.associacao.example');
    assert.equal(
      oauthRedirectUri('google_calendar', req),
      'https://api.associacao.example/api/v1/modules/google_calendar/oauth/callback'
    );
    assert.equal(
      oauthRedirectUri('melhorenvio'),
      'https://api.associacao.example/api/v1/modules/melhorenvio/oauth/callback'
    );
  });

  it('falls back to localhost outside production when env is empty', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.PUBLIC_API_URL;
    delete process.env.API_PUBLIC_URL;
    const req = {
      get: () => 'evil.example',
      protocol: 'https',
    };
    const base = publicApiBase(req);
    assert.match(base, /^http:\/\/localhost:\d+$/);
    assert.equal(oauthRedirectUri('google_calendar', req).startsWith(base), true);
    assert.ok(!base.includes('evil'));
  });

  it('throws PUBLIC_API_URL_MISSING in production when env is empty', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_API_URL;
    delete process.env.API_PUBLIC_URL;
    assert.throws(
      () => publicApiBase({ get: () => 'api.example.com' }),
      (err) => err instanceof AppError && err.code === 'PUBLIC_API_URL_MISSING' && err.status === 400
    );
    assert.throws(
      () => oauthRedirectUri('melhorenvio'),
      (err) => err instanceof AppError && err.code === 'PUBLIC_API_URL_MISSING'
    );
  });
});
