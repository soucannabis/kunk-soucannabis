'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../helpers/db');
const { resetRateLimits } = require('../../../src/utils/rateLimit');

describe('admin/system-errors', { concurrency: false }, () => {
  let app;
  let cookie;
  let errorHash;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  beforeEach(() => {
    resetRateLimits();
  });

  it('POST /system-errors records an event', async () => {
    const res = await request(app)
      .post('/api/v1/system-errors')
      .send({
        source: 'frontend',
        app: 'admin',
        message: `e2e-admin-error-${Date.now()}`,
        code: 'E2E_TEST',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.id);
    assert.ok(res.body.data.error_hash);
    errorHash = res.body.data.error_hash;
  });

  it('POST /system-errors ignores body user_code and forces source frontend', async () => {
    const res = await request(app)
      .post('/api/v1/system-errors')
      .send({
        source: 'backend',
        app: 'admin',
        message: `inject-user-${Date.now()}`,
        code: 'E2E_INJECT',
        user_code: 'attacker-code',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const row = await query(`SELECT user_code, source FROM system_errors WHERE id = $1`, [res.body.data.id]);
    assert.equal(row.rows[0].source, 'frontend');
    assert.equal(row.rows[0].user_code, null);
  });

  it('POST /system-errors uses session user_code, not the body', async () => {
    const res = await request(app)
      .post('/api/v1/system-errors')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({
        source: 'frontend',
        app: 'admin',
        message: `session-user-${Date.now()}`,
        code: 'E2E_SESSION',
        user_code: 'attacker-code',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const row = await query(`SELECT user_code FROM system_errors WHERE id = $1`, [res.body.data.id]);
    assert.ok(row.rows[0].user_code);
    assert.notEqual(row.rows[0].user_code, 'attacker-code');
  });

  it('rate-limits anonymous POST /system-errors after 10 hits per IP per minute', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/system-errors')
        .send({
          source: 'frontend',
          app: 'admin',
          message: `rl-${Date.now()}-${i}`,
          code: 'E2E_RL',
        });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    const limited = await request(app)
      .post('/api/v1/system-errors')
      .send({
        source: 'frontend',
        app: 'admin',
        message: 'rl-overflow',
        code: 'E2E_RL',
      });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
  });

  it('GET /admin/system-errors/summary', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-errors/summary')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
  });

  it('GET /admin/system-errors lists rows', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-errors?limit=20')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });

  it('GET /admin/system-errors/top', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-errors/top?period=30d&limit=10')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });

  it('GET samples for hash when recorded', async () => {
    if (!errorHash) return;
    const res = await request(app)
      .get(`/api/v1/admin/system-errors/${errorHash}/samples?limit=5`)
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });
});
