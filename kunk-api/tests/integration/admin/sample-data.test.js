'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('admin/sample-data', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /admin/sample-data returns summary', async () => {
    const res = await request(app).get('/api/v1/admin/sample-data').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/admin/sample-data');
    assert.ok(res.status === 401 || res.status === 403);
  });
});
