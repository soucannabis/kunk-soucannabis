'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { loginAsAdmin, loginAsOperator } = require('../../helpers/auth');

describe('domain/search-rbac', () => {
  let app;
  let adminCookie;
  let acolCookie;
  let portalCookie;

  before(async () => {
    const admin = await loginAsAdmin();
    app = admin.app;
    adminCookie = admin.cookie;

    const stamp = Date.now();
    const acol = await loginAsOperator({
      email: `search-acol-${stamp}@kunk-api.test`,
      password: 'TestAcol123!',
      permissions: ['Acolhimento'],
      name: 'Search',
      last_name: 'Acol',
      internal_code: `ACOL-SEARCH-${stamp}`,
      app: 'kunk',
    });
    acolCookie = acol.cookie;

    const portal = await loginAsOperator({
      email: `search-pro-${stamp}@kunk-api.test`,
      password: 'TestPro123!',
      permissions: ['Profissional'],
      name: 'Search',
      last_name: 'Pro',
      internal_code: uuidv4(),
      app: 'kunk',
    });
    portalCookie = portal.cookie;
  });

  it('Acolhimento reads users and reception', async () => {
    const users = await request(app)
      .get('/api/v1/search')
      .query({ q: 'a', entity: 'users' })
      .set('Cookie', acolCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(users.status, 200, JSON.stringify(users.body));
    assert.ok(Array.isArray(users.body.data));

    const reception = await request(app)
      .get('/api/v1/search')
      .query({ q: 'a', entity: 'reception' })
      .set('Cookie', acolCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(reception.status, 200, JSON.stringify(reception.body));
  });

  it('Profissional cannot search users, orders or reception', async () => {
    for (const entity of ['users', 'orders', 'reception']) {
      const res = await request(app)
        .get('/api/v1/search')
        .query({ q: 'a', entity })
        .set('Cookie', portalCookie)
        .set('X-Kunk-App', 'kunk');
      assert.equal(res.status, 403, `${entity}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.errors[0].code, 'FORBIDDEN');
    }
  });

  it('Profissional can search services scoped to professional_id', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .query({ q: 'a', entity: 'services' })
      .set('Cookie', portalCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
  });

  it('Admin still searches users', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .query({ q: 'a', entity: 'users' })
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});
