'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin, loginAsOperator, createBearerToken } = require('../../helpers/auth');

const SETUP_PATHS = [
  ['get', '/api/v1/modules/google_calendar/oauth/authorize?redirect=0'],
  ['post', '/api/v1/modules/pagarme/webhooks/ensure'],
  ['post', '/api/v1/modules/pagarme/webhooks/validate'],
  ['post', '/api/v1/modules/pagarme/webhooks/test-payment'],
  ['post', '/api/v1/modules/utalk/test'],
  ['get', '/api/v1/modules/soucannabis_orders/outbound-credentials?reveal=1'],
];

describe('modules/setup-authz', () => {
  let app;
  let adminCookie;
  let operatorCookie;
  let limitedToken;

  before(async () => {
    const admin = await loginAsAdmin();
    app = admin.app;
    adminCookie = admin.cookie;
    const op = await loginAsOperator();
    operatorCookie = op.cookie;
    limitedToken = await createBearerToken(adminCookie, ['items:tags:read']);
  });

  function asAdmin(method, path) {
    return request(app)[method](path).set('Cookie', adminCookie).set('X-Kunk-App', 'admin');
  }

  function asAcolhimento(method, path) {
    return request(app)[method](path).set('Cookie', operatorCookie).set('X-Kunk-App', 'kunk');
  }

  function asLimitedBearer(method, path) {
    return request(app)[method](path).set('Authorization', `Bearer ${limitedToken}`);
  }

  it('Acolhimento receives 403 on setup/OAuth/test/secret routes', async () => {
    for (const [method, path] of SETUP_PATHS) {
      const res = await asAcolhimento(method, path);
      assert.equal(res.status, 403, `${method.toUpperCase()} ${path} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.errors[0].code, 'FORBIDDEN');
    }
  });

  it('limited API key receives 403 on setup/OAuth/test/secret routes', async () => {
    for (const [method, path] of SETUP_PATHS) {
      const res = await asLimitedBearer(method, path);
      assert.equal(res.status, 403, `${method.toUpperCase()} ${path} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.errors[0].code, 'FORBIDDEN');
    }
  });

  it('Acolhimento can still read operational status', async () => {
    const pagarme = await asAcolhimento('get', '/api/v1/modules/pagarme/status');
    assert.notEqual(pagarme.status, 403, JSON.stringify(pagarme.body));

    const calendar = await asAcolhimento('get', '/api/v1/modules/google_calendar/status');
    assert.notEqual(calendar.status, 403, JSON.stringify(calendar.body));
  });

  it('Administrador is not forbidden on setup routes', async () => {
    const adminSetupReads = [
      ['get', '/api/v1/modules'],
      ['get', '/api/v1/modules/google_calendar/oauth/authorize?redirect=0'],
      ['get', '/api/v1/modules/pagarme/webhooks/status'],
      ['get', '/api/v1/modules/soucannabis_orders/outbound-credentials?reveal=1'],
    ];
    for (const [method, path] of adminSetupReads) {
      const res = await asAdmin(method, path);
      assert.notEqual(res.status, 403, `${method.toUpperCase()} ${path} ${JSON.stringify(res.body)}`);
      assert.notEqual(res.status, 401, `${method.toUpperCase()} ${path} ${JSON.stringify(res.body)}`);
    }
  });
});
