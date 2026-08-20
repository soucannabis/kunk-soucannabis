'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { itemsCrudSuite } = require('../../helpers/itemsCrudSuite');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../helpers/db');

itemsCrudSuite('users');

describe('items/users password write', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('does not persist account_password from items create or patch', async () => {
    const created = await request(app)
      .post('/api/v1/items/users')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Plain',
        email_account: `items-pwd-${Date.now()}@test.local`,
        user_code: uuidv4(),
        account_password: 'plain-secret',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.account_password, undefined);

    const row = await query(`SELECT account_password FROM users WHERE id = $1`, [id]);
    assert.equal(row.rows[0].account_password, null);

    const patched = await request(app)
      .patch(`/api/v1/items/users/${id}`)
      .set('Cookie', cookie)
      .send({ annotations: 'note', account_password: 'plain-secret-2' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));

    const after = await query(`SELECT account_password FROM users WHERE id = $1`, [id]);
    assert.equal(after.rows[0].account_password, null);

    await request(app).delete(`/api/v1/items/users/${id}`).set('Cookie', cookie);
  });

  it('create keeps user_code and status; patch drops funnel and identity', async () => {
    const code = uuidv4();
    const created = await request(app)
      .post('/api/v1/items/users')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Items',
        email_account: `items-funnel-${Date.now()}@test.local`,
        user_code: code,
        status: 'cadastro_criado',
        associate_status: 'dados_pessoais',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.user_code, code);
    assert.equal(created.body.data.status, 'cadastro_criado');
    assert.equal(created.body.data.associate_status, 'dados_pessoais');

    const patched = await request(app)
      .patch(`/api/v1/items/users/${id}`)
      .set('Cookie', cookie)
      .send({
        street: 'Rua A',
        street_number: '10',
        annotations: 'ok',
        prescription: 'rx-1',
        associate_status: 'concluido',
        status: 'Associado',
        user_code: uuidv4(),
      });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.data.street, 'Rua A');
    assert.equal(patched.body.data.street_number, '10');
    assert.equal(patched.body.data.annotations, 'ok');
    assert.equal(patched.body.data.prescription, 'rx-1');
    assert.equal(patched.body.data.user_code, code);
    assert.equal(patched.body.data.status, 'cadastro_criado');
    assert.equal(patched.body.data.associate_status, 'dados_pessoais');

    await request(app).delete(`/api/v1/items/users/${id}`).set('Cookie', cookie);
  });
});
