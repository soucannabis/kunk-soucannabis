'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('admin/cache', () => {
  let app;
  let cookie;
  let originalEnabled;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /admin/cache returns status', async () => {
    const res = await request(app).get('/api/v1/admin/cache').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.data.enabled, 'boolean');
    assert.equal(typeof res.body.data.size, 'number');
    originalEnabled = res.body.data.enabled;
  });

  it('PATCH toggles enabled and POST clear works', async () => {
    const off = await request(app)
      .patch('/api/v1/admin/cache')
      .set('Cookie', cookie)
      .send({ enabled: false });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.data.enabled, false);

    const cleared = await request(app)
      .post('/api/v1/admin/cache/clear')
      .set('Cookie', cookie)
      .send({});
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.data.ok, true);

    const restore = await request(app)
      .patch('/api/v1/admin/cache')
      .set('Cookie', cookie)
      .send({ enabled: originalEnabled !== false });
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
  });

  it('GET /cache/status as authenticated operator', async () => {
    const res = await request(app).get('/api/v1/cache/status').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.data.enabled, 'boolean');
  });
});
