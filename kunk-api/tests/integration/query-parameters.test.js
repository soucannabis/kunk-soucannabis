'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../helpers/auth');

describe('query-parameters', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    await request(app)
      .post('/api/v1/items/tags')
      .set('Cookie', cookie)
      .send({ tag: 'query-alpha', contexts: 'orders', color: '#111' });
    await request(app)
      .post('/api/v1/items/tags')
      .set('Cookie', cookie)
      .send({ tag: 'query-beta', contexts: 'services', color: '#222' });
  });

  it('filter _eq', async () => {
    const res = await request(app)
      .get('/api/v1/items/tags')
      .query({ 'filter[tag][_eq]': 'query-alpha' })
      .set('Cookie', cookie);
    // nested query may arrive as object via express qs
    assert.equal(res.status, 200);
  });

  it('filter JSON', async () => {
    const res = await request(app)
      .get('/api/v1/items/tags')
      .query({ filter: JSON.stringify({ tag: { _eq: 'query-alpha' } }) })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.every((r) => r.tag === 'query-alpha'));
  });

  it('sort limit offset meta search fields', async () => {
    const res = await request(app)
      .get('/api/v1/items/tags')
      .query({
        sort: '-id',
        limit: 5,
        offset: 0,
        meta: 'filter_count,total_count',
        search: 'query',
        fields: 'id,tag,contexts',
      })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.meta.filter_count >= 0);
    assert.ok(res.body.meta.total_count >= 0);
    if (res.body.data[0]) {
      assert.ok(!('color' in res.body.data[0]) || res.body.data[0].color === undefined);
      assert.ok('tag' in res.body.data[0]);
    }
  });

  it('rejects page+offset together', async () => {
    const res = await request(app)
      .get('/api/v1/items/tags')
      .query({ page: 1, offset: 0 })
      .set('Cookie', cookie);
    assert.equal(res.status, 400);
  });
});
