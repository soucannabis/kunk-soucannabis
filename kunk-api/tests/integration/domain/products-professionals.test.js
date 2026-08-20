'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { v4: uuidv4 } = require('uuid');

describe('domain/products-professionals', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('products batch and sync', async () => {
    const created = await request(app)
      .post('/api/v1/items/products')
      .set('Cookie', cookie)
      .send({ status: 'active', name: 'Oil', sku: `S${Date.now()}`, batch: 'A' });
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const batch = await request(app)
      .patch(`/api/v1/products/${id}/batch`)
      .set('Cookie', cookie)
      .send({ batch: 'B' });
    assert.equal(batch.status, 200);
    const sync = await request(app)
      .post('/api/v1/products/sync-batches')
      .set('Cookie', cookie)
      .send({ items: [{ id, batch: 'C' }] });
    assert.equal(sync.status, 200);
  });

  it('professionals list and donation-balance', async () => {
    const created = await request(app)
      .post('/api/v1/items/professionals')
      .set('Cookie', cookie)
      .send({ name: 'Dr', last_name: 'Y', professional_code: uuidv4(), donation_balance: 0 });
    assert.equal(created.status, 201);
    const list = await request(app).get('/api/v1/professionals').set('Cookie', cookie);
    assert.equal(list.status, 200);
    const bal = await request(app)
      .patch(`/api/v1/professionals/${created.body.data.id}/donation-balance`)
      .set('Cookie', cookie)
      .send({ donation_balance: 10 });
    assert.equal(bal.status, 200);
  });
});
