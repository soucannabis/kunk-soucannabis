'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('modules/ciap2', () => {
  let app;
  let cookie;
  let originalEnabled;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /modules/ciap2/status is public', async () => {
    const res = await request(app).get('/api/v1/modules/ciap2/status');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.data.enabled, 'boolean');
    originalEnabled = res.body.data.enabled;
  });

  it('PATCH /modules/ciap2 requires admin and toggles', async () => {
    const next = !originalEnabled;
    const res = await request(app)
      .patch('/api/v1/modules/ciap2')
      .set('Cookie', cookie)
      .send({ enabled: next });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.enabled, next);

    const restore = await request(app)
      .patch('/api/v1/modules/ciap2')
      .set('Cookie', cookie)
      .send({ enabled: originalEnabled });
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
  });
});
