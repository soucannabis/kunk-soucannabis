'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('domain/reports-tags-system-users-search', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('reports save run favorite', async () => {
    const created = await request(app)
      .post('/api/v1/reports')
      .set('Cookie', cookie)
      .send({ name: 'R1', query_config: { table: 'orders' } });
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const run = await request(app).post(`/api/v1/reports/${id}/run`).set('Cookie', cookie);
    assert.equal(run.status, 200);
    const fav = await request(app).post(`/api/v1/reports/${id}/favorite`).set('Cookie', cookie);
    assert.equal(fav.status, 200);
  });

  it('tags by context', async () => {
    await request(app)
      .post('/api/v1/items/tags')
      .set('Cookie', cookie)
      .send({ tag: 'ctx', contexts: 'orders' });
    const res = await request(app)
      .get('/api/v1/tags')
      .query({ contexts: 'orders' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
  });

  it('system-users list and create', async () => {
    const list = await request(app).get('/api/v1/system-users').set('Cookie', cookie);
    assert.equal(list.status, 200);
    const created = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        name: 'N',
        email: `n${Date.now()}@t.com`,
        password: 'Secret123!',
        permissions: '["Acolhimento"]',
        status: 'active',
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.password, undefined);
  });

  it('global search', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .query({ q: 'Dom', entity: 'users' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.meta);
  });
});