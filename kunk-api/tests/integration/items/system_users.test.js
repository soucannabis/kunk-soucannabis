'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { itemsCrudSuite } = require('../../helpers/itemsCrudSuite');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../helpers/db');

itemsCrudSuite('system_users');

describe('items/system_users password write', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('does not persist password from items create or patch', async () => {
    const email = `items-op-${Date.now()}@test.local`;
    const created = await request(app)
      .post('/api/v1/items/system_users')
      .set('Cookie', cookie)
      .send({
        name: 'Op',
        last_name: 'Plain',
        email,
        permissions: '["Acolhimento"]',
        status: 'active',
        password: 'plain-secret',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.password, undefined);

    const row = await query(`SELECT password FROM system_users WHERE id = $1`, [id]);
    assert.equal(row.rows[0].password, null);

    const patched = await request(app)
      .patch(`/api/v1/items/system_users/${id}`)
      .set('Cookie', cookie)
      .send({ city: 'SP', password: 'plain-secret-2' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));

    const after = await query(`SELECT password FROM system_users WHERE id = $1`, [id]);
    assert.equal(after.rows[0].password, null);

    await query(`DELETE FROM operator_sessions WHERE user_id = $1`, [id]).catch(() => {});
    await request(app).delete(`/api/v1/items/system_users/${id}`).set('Cookie', cookie);
  });
});
