'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../helpers/db');
const { patchPayload } = require('../../helpers/fixtures/payloads');
const { uniqueValidCpf } = require('../../helpers/integrationEnv');
const { v4: uuidv4 } = require('uuid');

describe('domain/institutional_clients', () => {
  let app;
  let cookie;
  let createdId;
  let clientCode;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    clientCode = uuidv4();
    const cpf = uniqueValidCpf().replace(/\D/g, '');
    const inserted = await query(
      `INSERT INTO institutional_clients (
        client_code, status, is_company, representative_name, representative_last_name,
        representative_cpf, representative_email, representative_mobile,
        street, street_number, neighborhood, city, state, cep,
        date_created, date_updated
      ) VALUES ($1, 'active', false, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id`,
      [
        clientCode,
        'Cliente',
        'Institucional',
        cpf,
        `institutional${Date.now()}@t.com`,
        '11987654321',
        'Rua Teste',
        '10',
        'Centro',
        'Sao Paulo',
        'SP',
        '01310100',
      ]
    );
    createdId = inserted.rows[0].id;
  });

  after(async () => {
    if (createdId) {
      await query(`DELETE FROM institutional_clients WHERE id = $1`, [createdId]).catch(() => {});
    }
  });

  it('lists with envelope', async () => {
    const list = await request(app).get('/api/v1/institutional-clients').set('Cookie', cookie);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data));
    assert.equal(list.body.errors, null);
  });

  it('gets, searches by code, patches and deletes via domain routes', async () => {
    const got = await request(app)
      .get(`/api/v1/institutional-clients/${createdId}`)
      .set('Cookie', cookie);
    assert.equal(got.status, 200);
    assert.equal(String(got.body.data.id), String(createdId));

    const byCode = await request(app)
      .get(`/api/v1/institutional-clients/by-code/${clientCode}`)
      .set('Cookie', cookie);
    assert.equal(byCode.status, 200);
    assert.equal(byCode.body.data.client_code, clientCode);

    const search = await request(app)
      .get('/api/v1/institutional-clients/search')
      .query({ q: 'Cliente' })
      .set('Cookie', cookie);
    assert.equal(search.status, 200);
    assert.ok(Array.isArray(search.body.data));

    const updated = await request(app)
      .patch(`/api/v1/institutional-clients/${createdId}`)
      .set('Cookie', cookie)
      .send(patchPayload('institutional_clients'));
    assert.equal(updated.status, 200, JSON.stringify(updated.body));

    const deleted = await request(app)
      .delete(`/api/v1/institutional-clients/${createdId}`)
      .set('Cookie', cookie);
    assert.equal(deleted.status, 200);
    createdId = null;
  });
});
