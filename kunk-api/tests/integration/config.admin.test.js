'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin, loginAsOperator } = require('../helpers/auth');
const { query } = require('../helpers/db');

describe('config admin', () => {
  let app;
  let adminCookie;
  let operatorCookie;

  before(async () => {
    const admin = await loginAsAdmin();
    app = admin.app;
    adminCookie = admin.cookie;
    const op = await loginAsOperator();
    operatorCookie = op.cookie;
  });

  it('lists systems and configs for Administrador', async () => {
    await query(
      `INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, hardcoded_default, description)
       VALUES ('registration', 'VITE_ASSOCIATION_NAME', 'Test Assoc', 'string', false, true, 'Kunk', 'Nome')
       ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value`
    );

    const systems = await request(app)
      .get('/api/v1/config/systems')
      .set('Cookie', adminCookie);
    assert.equal(systems.status, 200, JSON.stringify(systems.body));
    assert.ok(Array.isArray(systems.body.data));
    assert.ok(systems.body.data.some((s) => s.system === 'registration'));

    const listed = await request(app)
      .get('/api/v1/config?system=registration')
      .set('Cookie', adminCookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.data.system, 'registration');
    assert.ok(Array.isArray(listed.body.data.items));
  });

  it('creates, patches, clears and deletes a config key', async () => {
    const key = `TEST_KEY_${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/config')
      .set('Cookie', adminCookie)
      .send({
        system: 'admin',
        key,
        value: 'hello',
        value_type: 'string',
        description: 'temp',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.key, key);
    assert.equal(created.body.data.resolved_value, 'hello');
    const id = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/config/${id}`)
      .set('Cookie', adminCookie)
      .send({ value: 'world' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.data.resolved_value, 'world');

    const cleared = await request(app)
      .post(`/api/v1/config/${id}/clear`)
      .set('Cookie', adminCookie);
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.data.has_value, false);

    const deleted = await request(app)
      .delete(`/api/v1/config/${id}`)
      .set('Cookie', adminCookie);
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  });

  it('masks sensitive values and rejects non-admin', async () => {
    process.env.CONFIG_ENCRYPT_KEY = process.env.CONFIG_ENCRYPT_KEY || '0123456789abcdef0123456789abcdef';
    const key = `SECRET_${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/config')
      .set('Cookie', adminCookie)
      .send({
        system: 'api',
        key,
        value: 'super-secret',
        is_sensitive: true,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.value, '********');
    assert.equal(created.body.data.resolved_value, null);
    assert.equal(created.body.data.has_value, true);

    await request(app).delete(`/api/v1/config/${created.body.data.id}`).set('Cookie', adminCookie);

    const forbidden = await request(app)
      .get('/api/v1/config/systems')
      .set('Cookie', operatorCookie);
    assert.equal(forbidden.status, 403);
  });
});
