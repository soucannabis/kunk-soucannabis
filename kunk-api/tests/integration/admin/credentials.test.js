'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../../src/db/pool');
const fs = require('fs');
const path = require('path');

describe('admin/credentials', () => {
  let app;
  let cookie;

  before(async () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../sql/create-system-api-credentials.sql'),
      'utf8'
    );
    await query(sql);
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('lists credentials without plaintext secrets', async () => {
    const res = await request(app)
      .get('/api/v1/admin/external-services/loggi/credentials')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const creds = res.body.data.credentials || [];
    assert.ok(creds.length >= 1);
    for (const c of creds) {
      assert.equal(c.encrypted_value, undefined);
      assert.ok(!Object.prototype.hasOwnProperty.call(c, 'plaintext'));
      assert.equal(typeof c.has_value, 'boolean');
      assert.equal(typeof c.field_key, 'string');
    }
  });

  it('failed test does not persist secret', async () => {
    const before = await request(app)
      .get('/api/v1/admin/external-services/loggi/credentials')
      .set('Cookie', cookie);
    const secretMeta = (before.body.data.credentials || []).find((c) => c.field_key === 'client_secret');
    const hadDb = secretMeta?.source === 'db';

    const res = await request(app)
      .put('/api/v1/admin/external-services/loggi/credentials')
      .set('Cookie', cookie)
      .send({
        fields: {
          client_id: 'fake-id',
          client_secret: 'fake-secret-should-not-save',
          company_id: '123',
        },
        run_test: true,
      });

    assert.equal(res.status, 400);
    assert.ok(
      ['CREDENTIAL_INVALID', 'CREDENTIAL_MISSING', 'CONFIG_ERROR'].includes(res.body.errors[0].code),
      res.body.errors[0].code
    );

    const after = await request(app)
      .get('/api/v1/admin/external-services/loggi/credentials')
      .set('Cookie', cookie);
    const afterSecret = (after.body.data.credentials || []).find((c) => c.field_key === 'client_secret');
    if (!hadDb) {
      assert.notEqual(afterSecret?.source, 'db');
    }
  });
});
