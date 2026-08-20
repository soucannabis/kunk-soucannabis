'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { v4: uuidv4 } = require('uuid');

const ORDER_ADDRESS = {
  street: 'Rua Teste',
  street_number: '10',
  neighborhood: 'Centro',
  city: 'Sao Paulo',
  state: 'SP',
  cep: '01310100',
};

describe('domain/orders', () => {
  let app;
  let cookie;
  let orderId;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('rejects unsupported checkout fields', async () => {
    const dead = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({
        status: 'Novo',
        associate_name: 'A',
        total: 0,
        coupon_id: 'C1',
      });
    assert.equal(dead.status, 400);
    assert.equal(dead.body.errors[0].code, 'VALIDATION_ERROR');
    assert.match(dead.body.errors[0].message, /coupon_id/);
  });

  it('create and status/production/payment/stats', async () => {
    const created = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({ status: 'Novo', associate_name: 'A', user_code: uuidv4(), total: 0, items: [], address: ORDER_ADDRESS });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    orderId = created.body.data.id;

    const st = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'Aguardando aprovação' });
    assert.equal(st.status, 200);

    const pr = await request(app)
      .patch(`/api/v1/orders/${orderId}/production`)
      .set('Cookie', cookie)
      .send({ production_owner: 'op1' });
    assert.equal(pr.status, 200);

    const pay = await request(app)
      .post(`/api/v1/orders/${orderId}/payment`)
      .set('Cookie', cookie)
      .send({ payment_link: 'http://pay', payment_code: 'X' });
    assert.equal(pay.status, 200);

    const stats = await request(app).get('/api/v1/orders/stats').set('Cookie', cookie);
    assert.equal(stats.status, 200);
    assert.ok(stats.body.data.by_status);
  });
});
