'use strict';

/**
 * OAuth CSRF state — uses client_id/secret already stored in system_api_credentials.
 * Authorize URL tests skip per service when those fields are empty.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const credentialsService = require('../../../src/services/credentialsService');

async function hasOAuthClient(service) {
  try {
    const id = await credentialsService.resolveField(service, 'client_id');
    const secret = await credentialsService.resolveField(service, 'client_secret');
    return Boolean(id.value && secret.value);
  } catch {
    return false;
  }
}

describe('modules/oauth-state', () => {
  let app;
  let cookie;
  let hasGoogle = false;
  let hasMelhorEnvio = false;

  before(async () => {
    process.env.CONFIG_ENCRYPT_KEY =
      process.env.CONFIG_ENCRYPT_KEY || '0123456789abcdef0123456789abcdef';
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
    hasGoogle = await hasOAuthClient('google_calendar');
    hasMelhorEnvio = await hasOAuthClient('melhorenvio');
  });

  function asAdmin(path) {
    return request(app).get(path).set('Cookie', cookie).set('X-Kunk-App', 'admin');
  }

  it('public Google callback without state is rejected', async () => {
    const res = await request(app)
      .get('/api/v1/modules/google_calendar/oauth/callback')
      .query({ format: 'json', code: 'fake-code' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.errors[0].code, 'OAUTH_STATE_INVALID');
  });

  it('public Melhor Envio callback without state is rejected', async () => {
    const res = await request(app)
      .get('/api/v1/modules/melhorenvio/oauth/callback')
      .query({ format: 'json', code: 'fake-code' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.errors[0].code, 'OAUTH_STATE_INVALID');
  });

  it('Google authorize URL includes state when client credentials exist in DB', async (t) => {
    if (!hasGoogle) {
      t.skip('google_calendar client_id/secret ausentes no PG — suite requires-oauth-seed');
      return;
    }
    const res = await asAdmin('/api/v1/modules/google_calendar/oauth/authorize?redirect=0');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const url = String(res.body.data?.url || '');
    assert.ok(url.startsWith('https://accounts.google.com/'), url);
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    assert.ok(state, url);
    assert.ok(parsed.searchParams.get('client_id'), url);

    const reused = await request(app)
      .get('/api/v1/modules/google_calendar/oauth/callback')
      .query({ format: 'json', code: 'not-a-real-code', state });
    assert.equal(reused.status, 400, JSON.stringify(reused.body));
    assert.notEqual(reused.body.errors[0].code, 'OAUTH_STATE_INVALID');
  });

  it('Melhor Envio authorize URL includes state when client credentials exist in DB', async (t) => {
    if (!hasMelhorEnvio) {
      t.skip('melhorenvio client_id/secret ausentes no PG — suite requires-oauth-seed');
      return;
    }
    const res = await asAdmin('/api/v1/modules/melhorenvio/oauth/authorize');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const url = String(res.body.data?.url || '');
    assert.ok(url.includes('/oauth/authorize'), url);
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    assert.ok(state, url);
    assert.ok(parsed.searchParams.get('client_id'), url);

    const reused = await request(app)
      .get('/api/v1/modules/melhorenvio/oauth/callback')
      .query({ format: 'json', code: 'not-a-real-code', state });
    assert.equal(reused.status, 400, JSON.stringify(reused.body));
    assert.notEqual(reused.body.errors[0].code, 'OAUTH_STATE_INVALID');
  });

  it('Google authorize ignores X-Forwarded-Host for redirect_uri', async (t) => {
    if (!hasGoogle) {
      t.skip('google_calendar client_id/secret ausentes no PG — suite requires-oauth-seed');
      return;
    }
    const { oauthRedirectUri } = require('../../../src/utils/publicApiUrl');
    const expected = oauthRedirectUri('google_calendar');
    const res = await request(app)
      .get('/api/v1/modules/google_calendar/oauth/authorize?redirect=0')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Original-Host', 'evil.example');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const url = String(res.body.data?.url || '');
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('redirect_uri'), expected);
    assert.ok(!url.includes('evil.example'), url);
  });

  it('Melhor Envio authorize ignores X-Forwarded-Host for redirect_uri', async (t) => {
    if (!hasMelhorEnvio) {
      t.skip('melhorenvio client_id/secret ausentes no PG — suite requires-oauth-seed');
      return;
    }
    const { oauthRedirectUri } = require('../../../src/utils/publicApiUrl');
    const expected = oauthRedirectUri('melhorenvio');
    const res = await request(app)
      .get('/api/v1/modules/melhorenvio/oauth/authorize')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Original-Host', 'evil.example');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const url = String(res.body.data?.url || '');
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('redirect_uri'), expected);
    assert.ok(!url.includes('evil.example'), url);
  });
});
