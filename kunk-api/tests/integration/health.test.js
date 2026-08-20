'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp } = require('../helpers/app');

describe('health', () => {
  it('GET /api/v1/health returns envelope', async () => {
    const app = getApp();
    const res = await request(app).get('/api/v1/health');
    assert.ok([200, 503].includes(res.status));
    assert.ok('data' in res.body);
    assert.ok('errors' in res.body);
    if (res.status === 200) {
      assert.equal(res.body.data.ok, true);
      assert.equal(res.body.data.db, 'up');
      assert.equal(res.body.errors, null);
    }
  });

  it('sends Helmet security headers without HSTS in test', async () => {
    const app = getApp();
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.ok(res.headers['referrer-policy']);
    assert.equal(res.headers['strict-transport-security'], undefined);
  });

  it('OAuth callback HTML sets CSP frame-ancestors none', async () => {
    const app = getApp();
    const res = await request(app).get('/api/v1/modules/melhorenvio/oauth/callback');
    assert.equal(res.status, 200);
    assert.match(String(res.headers['content-type']), /text\/html/);
    const csp = String(res.headers['content-security-policy'] || '');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src 'unsafe-inline'/);
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });
});
