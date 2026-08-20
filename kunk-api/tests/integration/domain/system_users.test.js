'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { ensureAdminUser, query } = require('../../helpers/db');

describe('domain/system_users', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('lists and creates via /system-users without leaking secrets', async () => {
    const listed = await request(app).get('/api/v1/system-users').set('Cookie', cookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(Array.isArray(listed.body.data));
    assert.ok(listed.body.data.length > 0);
    assert.equal(listed.body.data[0].password, undefined);
    assert.equal(listed.body.data[0].session_token, undefined);

    const email = `sys${Date.now()}@t.com`;
    const created = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        email,
        name: 'Sys',
        last_name: 'Test',
        permissions: ['Acolhimento'],
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.user.email, email);
    assert.equal(created.body.data.user.password, undefined);
    assert.ok(created.body.data.invite_url);
    assert.equal(created.body.data.user.status, 'pending');
  });

  it('gets, patches and deletes a system user', async () => {
    const email = `syspatch${Date.now()}@t.com`;
    const created = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        email,
        name: 'Patch',
        last_name: 'Me',
        permissions: ['Produção'],
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.user.id;

    const got = await request(app).get(`/api/v1/system-users/${id}`).set('Cookie', cookie);
    assert.equal(got.status, 200, JSON.stringify(got.body));
    assert.equal(got.body.data.email, email);

    const patched = await request(app)
      .patch(`/api/v1/system-users/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Patched', status: 'inactive' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.data.name, 'Patched');
    assert.equal(patched.body.data.status, 'inactive');

    const deleted = await request(app).delete(`/api/v1/system-users/${id}`).set('Cookie', cookie);
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  });

  it('blocks removing the last Administrador', async () => {
    await ensureAdminUser();
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    const adminUser = await query(`SELECT id FROM system_users WHERE email = 'admin@kunk-api.test'`);
    const adminId = adminUser.rows[0].id;

    // Keep only this admin active with Administrador
    await query(
      `UPDATE system_users SET status = 'active', permissions = $1 WHERE id = $2`,
      [JSON.stringify(['Administrador']), adminId]
    );
    await query(
      `UPDATE system_users SET status = 'inactive'
       WHERE id <> $1
         AND (
           permissions::text ILIKE '%Administrador%'
           OR permissions::text ILIKE '%administrador%'
         )`,
      [adminId]
    );

    const res = await request(app)
      .patch(`/api/v1/system-users/${adminId}`)
      .set('Cookie', cookie)
      .send({ permissions: ['Acolhimento'] });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.errors[0].code, 'LAST_ADMIN');

    await ensureAdminUser();
  });

  it('rejects Prescritor and mixed Profissional on invite', async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    const prescritor = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        email: `pre${Date.now()}@t.com`,
        name: 'Pre',
        last_name: 'Scritor',
        permissions: ['Prescritor'],
      });
    assert.equal(prescritor.status, 400, JSON.stringify(prescritor.body));

    const mixed = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        email: `mix${Date.now()}@t.com`,
        name: 'Mix',
        last_name: 'Role',
        permissions: ['Profissional', 'Acolhimento'],
        internal_code: 'any',
      });
    assert.equal(mixed.status, 400, JSON.stringify(mixed.body));

    const noCode = await request(app)
      .post('/api/v1/system-users')
      .set('Cookie', cookie)
      .send({
        email: `ncode${Date.now()}@t.com`,
        name: 'No',
        last_name: 'Code',
        permissions: ['Profissional'],
      });
    assert.equal(noCode.status, 400, JSON.stringify(noCode.body));
  });
});
