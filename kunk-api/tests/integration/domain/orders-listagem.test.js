'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { isolatePaymentModules, paymentBypassBody } = require('../../helpers/integrationEnv');
const { v4: uuidv4 } = require('uuid');

describe('domain/orders listagem', () => {
  let app;
  let cookie;
  let orderId;
  let productSku;
  let moduleIsolation;

  before(async () => {
    moduleIsolation = await isolatePaymentModules();
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    productSku = `T1-${uuidv4().slice(0, 8)}`;
    const product = await request(app)
      .post('/api/v1/items/products')
      .set('Cookie', cookie)
      .send({
        status: 'published',
        name: 'Item Listagem',
        sku: productSku,
        price: 10,
        amount: 100,
        batch: 'LOT-LIST-001',
      });
    assert.equal(product.status, 201, JSON.stringify(product.body));

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Teste Pedidos',
        user_code: uuidv4(),
        status: 'Aguardando pagamento',
        items: [
          {
            product_id: product.body.data.id,
            code: productSku,
            name: 'Item',
            amount: 10,
            quantity: 1,
          },
        ],
        total: 10,
        delivery_price: 0,
        discount: 0,
        donation: 0,
        tags: ['facet-tag'],
        address: {
          street: 'Rua Listagem',
          street_number: '1',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          cep: '01001000',
        },
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    orderId = created.body.data.id;
  });

  after(async () => {
    await moduleIsolation?.restore();
  });

  it('GET /orders/status-config returns defaults', async () => {
    const res = await request(app).get('/api/v1/orders/status-config').set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.statuses));
    assert.equal(res.body.data.awaiting, 'Aguardando pagamento');
    assert.equal(res.body.data.paid, 'Pagamento concluído');
  });

  it('GET /orders and /facets', async () => {
    const list = await request(app).get('/api/v1/orders?limit=10').set('Cookie', cookie);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.data));

    const facets = await request(app).get('/api/v1/orders/facets').set('Cookie', cookie);
    assert.equal(facets.status, 200, JSON.stringify(facets.body));
    assert.ok(facets.body.data.statusCounts);
  });

  it('PATCH status sets payment_date and stamps product batch on items', async () => {
    const paid = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send(paymentBypassBody('Pagamento concluído'));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.ok(paid.body.data.payment_date);
    const items = paid.body.data.items;
    assert.ok(Array.isArray(items) && items.length >= 1);
    assert.equal(items[0].batch, 'LOT-LIST-001');

    const back = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'Aguardando pagamento' });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.data.payment_date, null);
  });

  it('POST /orders/bulk status also stamps batch', async () => {
    const res = await request(app)
      .post('/api/v1/orders/bulk')
      .set('Cookie', cookie)
      .send({ ids: [orderId], action: 'status', status: 'Pagamento concluído' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.results[0].ok, true);
    assert.equal(res.body.data.results[0].data.items[0].batch, 'LOT-LIST-001');
  });

  it('POST /orders/bulk tags_add', async () => {
    const res = await request(app)
      .post('/api/v1/orders/bulk')
      .set('Cookie', cookie)
      .send({ ids: [orderId], action: 'tags_add', tags: ['bulk-test'] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.results[0].ok, true);
  });
});
