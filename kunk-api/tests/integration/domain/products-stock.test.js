'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../helpers/db');
const { isolatePaymentModules, paymentBypassBody } = require('../../helpers/integrationEnv');
const { v4: uuidv4 } = require('uuid');

const ADDRESS = {
  street: 'Rua Teste Estoque',
  street_number: '100',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  cep: '01001000',
};

describe('domain/products stock and import', () => {
  let app;
  let cookie;
  let productId;
  let sku;
  let moduleIsolation;

  before(async () => {
    moduleIsolation = await isolatePaymentModules();
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
    sku = `STK-${uuidv4().slice(0, 8)}`;

    const created = await request(app)
      .post('/api/v1/items/products')
      .set('Cookie', cookie)
      .send({
        status: 'published',
        name: 'Produto Estoque Teste',
        sku,
        type: 'oil',
        unit: 'ml',
        concentration: 100,
        price: 50,
        amount: 20,
        category: 'test',
        batch: 'LOT-STK',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    productId = created.body.data.id;
  });

  after(async () => {
    await moduleIsolation?.restore();
  });

  it('validates and imports CSV upsert by sku', async () => {
    const csv =
      'sku,name,type,unit,concentration,price,amount,category,batch,status\n' +
      `${sku},Produto Estoque Atualizado,oil,ml,100,55,25,test,LOT-STK2,published\n` +
      `NEW-${sku},Produto Novo CSV,capsule,unit,25,10,8,test,LOT-NEW,published\n`;

    const validated = await request(app)
      .post('/api/v1/products/import/validate')
      .set('Cookie', cookie)
      .send({ csv });
    assert.equal(validated.status, 200, JSON.stringify(validated.body));
    assert.equal(validated.body.data.valid, 2);
    assert.equal(validated.body.data.invalid, 0);

    const imported = await request(app)
      .post('/api/v1/products/import')
      .set('Cookie', cookie)
      .send({ csv });
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.data.success, true);
    assert.equal(imported.body.data.updated, 1);
    assert.equal(imported.body.data.created, 1);

    const product = await request(app)
      .get(`/api/v1/items/products/${productId}`)
      .set('Cookie', cookie);
    assert.equal(product.body.data.amount, 25);
    assert.equal(product.body.data.name, 'Produto Estoque Atualizado');
  });

  it('adjusts stock and lists movements', async () => {
    const adjusted = await request(app)
      .post(`/api/v1/products/${productId}/stock`)
      .set('Cookie', cookie)
      .send({ delta: 5, note: 'entrada teste' });
    assert.equal(adjusted.status, 200, JSON.stringify(adjusted.body));
    assert.equal(adjusted.body.data.amount, 30);

    const movements = await request(app)
      .get(`/api/v1/products/${productId}/movements`)
      .set('Cookie', cookie);
    assert.equal(movements.status, 200, JSON.stringify(movements.body));
    assert.ok((movements.body.data.movements || []).length >= 1);
  });

  it('debits stock on awaiting→paid and is idempotent; reverses on paid→awaiting', async () => {
    const before = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    const stockBefore = Number(before.rows[0].amount);

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Cliente Estoque',
        user_code: uuidv4(),
        status: 'Aguardando pagamento',
        items: [
          {
            product_id: productId,
            code: sku,
            name: 'Produto Estoque Teste',
            amount: 50,
            quantity: 2,
          },
        ],
        total: 100,
        delivery_price: 0,
        discount: 0,
        donation: 0,
        address: ADDRESS,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const orderId = created.body.data.id;

    const paid = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send(paymentBypassBody('Pagamento concluído'));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.ok(paid.body.data.payment_date);
    assert.ok(paid.body.data.stock_debited_at);

    const afterPay = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(afterPay.rows[0].amount), stockBefore - 2);

    const paidAgain = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send(paymentBypassBody('Pagamento concluído'));
    assert.equal(paidAgain.status, 200, JSON.stringify(paidAgain.body));
    const afterIdem = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(afterIdem.rows[0].amount), stockBefore - 2);

    const back = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'Aguardando pagamento' });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.data.payment_date, null);
    assert.equal(back.body.data.stock_debited_at, null);

    const afterReverse = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(afterReverse.rows[0].amount), stockBefore);
  });

  it('allows payment when stock is zero and may go negative', async () => {
    await query(`UPDATE products SET amount = 0 WHERE id = $1`, [productId]);

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Cliente Sem Estoque',
        user_code: uuidv4(),
        status: 'Aguardando pagamento',
        items: [
          {
            product_id: productId,
            code: sku,
            name: 'Produto Estoque Teste',
            amount: 50,
            quantity: 2,
          },
        ],
        total: 100,
        delivery_price: 0,
        discount: 0,
        donation: 0,
        address: ADDRESS,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.items?.[0]?.stock_at_order, 0);

    const paid = await request(app)
      .patch(`/api/v1/orders/${created.body.data.id}/status`)
      .set('Cookie', cookie)
      .send(paymentBypassBody('Pagamento concluído'));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.ok(paid.body.data.stock_debited_at);

    const after = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(after.rows[0].amount), -2);

    await query(`UPDATE products SET amount = 30 WHERE id = $1`, [productId]);
  });

  it('GET /products/export.csv returns csv headers', async () => {
    const res = await request(app).get('/api/v1/products/export.csv').set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /^sku,name,type,unit,concentration,price,amount,category,batch,status/);
  });

  it('updateOrder reverses stock when previously debited', async () => {
    await query(`UPDATE products SET amount = 40 WHERE id = $1`, [productId]);

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Cliente Edit Carrinho',
        user_code: uuidv4(),
        status: 'Aguardando pagamento',
        items: [
          {
            product_id: productId,
            code: sku,
            name: 'Produto Estoque Teste',
            amount: 50,
            quantity: 3,
          },
        ],
        total: 150,
        delivery_price: 0,
        discount: 0,
        donation: 0,
        address: ADDRESS,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const orderId = created.body.data.id;

    const paid = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send(paymentBypassBody('Pagamento concluído'));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.ok(paid.body.data.stock_debited_at);

    const mid = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(mid.rows[0].amount), 37);

    const updated = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .set('Cookie', cookie)
      .send({
        associate_name: 'Cliente Edit Carrinho',
        user_code: created.body.data.user_code,
        status: 'Aguardando pagamento',
        items: [
          {
            product_id: productId,
            code: sku,
            name: 'Produto Estoque Teste',
            amount: 50,
            quantity: 1,
          },
        ],
        total: 50,
        delivery_price: 0,
        discount: 0,
        donation: 0,
        address: ADDRESS,
      });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.stock_debited_at, null);

    const after = await query(`SELECT amount FROM products WHERE id = $1`, [productId]);
    assert.equal(Number(after.rows[0].amount), 40);
  });
});
