'use strict';

/**
 * Live Loggi integration — skipped unless RUN_LIVE_FREIGHT_TESTS=true
 * (módulo Loggi deve estar ativo no Admin; credenciais/config reais necessárias).
 */
const enabled = process.env.RUN_LIVE_FREIGHT_TESTS === 'true';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('loggi live', { skip: !enabled }, () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('quotes freight against Loggi API', async () => {
    const res = await request(app)
      .post('/api/v1/modules/loggi/quote-freight')
      .set('Cookie', cookie)
      .send({
        address: {
          street: 'Av. Goiás',
          number: '100',
          neighborhood: 'Centro',
          city: 'Goiânia',
          state: 'GO',
          cep: '74003010',
        },
      });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.options));
    assert.ok(res.body.data.options.length >= 1);
  });
});
