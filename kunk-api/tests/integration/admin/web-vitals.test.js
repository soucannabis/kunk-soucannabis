'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('admin/web-vitals', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('POST /web-vitals records a metric', async () => {
    const res = await request(app)
      .post('/api/v1/web-vitals')
      .send({
        name: 'LCP',
        value: 1200,
        rating: 'good',
        app: 'admin',
        url: 'http://localhost:4256/dados',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.id);
  });

  it('GET /admin/web-vitals/summary', async () => {
    const res = await request(app)
      .get('/api/v1/admin/web-vitals/summary?period=7d')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
  });

  it('GET /admin/web-vitals/series', async () => {
    const res = await request(app)
      .get('/api/v1/admin/web-vitals/series?period=7d&name=LCP')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data != null);
  });

  it('GET /admin/web-vitals/by-page', async () => {
    const res = await request(app)
      .get('/api/v1/admin/web-vitals/by-page?period=7d&name=LCP&limit=10')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });
});
