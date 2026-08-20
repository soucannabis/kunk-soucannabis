'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../helpers/auth');

describe('admin meta', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /admin/schema returns collections', async () => {
    const res = await request(app)
      .get('/api/v1/admin/schema')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data.collections));
    assert.ok(res.body.data.collections.some((c) => c.name === 'users'));
    assert.ok(res.body.data.collections.some((c) => c.name === 'tags'));
    const users = res.body.data.collections.find((c) => c.name === 'users');
    assert.ok(Array.isArray(users.readonly));
    assert.ok(Array.isArray(users.readonlyOnUpdate));
    assert.ok(users.readonly.includes('is_session_active'));
    assert.ok(!users.readonly.includes('user_code'));
    assert.ok(users.readonlyOnUpdate.includes('user_code'));
    assert.ok(users.readonlyOnUpdate.includes('associate_status'));
    assert.ok(!users.readonlyOnUpdate.includes('is_session_active'));
  });

  it('GET /admin/roles returns known roles', async () => {
    const res = await request(app)
      .get('/api/v1/admin/roles')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((r) => r.id === 'Administrador'));
    assert.ok(res.body.data.some((r) => r.id === 'Acolhimento'));
    assert.ok(res.body.data.some((r) => r.id === 'Profissional'));
    assert.ok(!res.body.data.some((r) => r.id === 'Prescritor'));
  });
});
