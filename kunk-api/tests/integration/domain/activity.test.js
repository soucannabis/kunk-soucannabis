'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('domain/activity', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /activity lists envelope', async () => {
    const res = await request(app)
      .get('/api/v1/activity?limit=20')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.errors, null);
  });

  it('GET /activity/mine', async () => {
    const res = await request(app)
      .get('/api/v1/activity/mine?limit=10')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });

  it('GET /activity/mine/unread-count', async () => {
    const res = await request(app)
      .get('/api/v1/activity/mine/unread-count')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data != null);
  });
});
