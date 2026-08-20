'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('domain/services', () => {
  let app;
  let cookie;
  let professionalCode;
  let associateCode;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    const pros = await request(app).get('/api/v1/items/professionals').query({ limit: 1 }).set('Cookie', cookie);
    professionalCode = pros.body.data?.[0]?.professional_code;

    const users = await request(app)
      .get('/api/v1/users')
      .query({ limit: 1, filter: JSON.stringify({ responsible_code: { _null: true } }) })
      .set('Cookie', cookie);
    associateCode = users.body.data?.[0]?.user_code;
  });

  it('rejects unknown include and invalid professional FK', async () => {
    const badInclude = await request(app)
      .get('/api/v1/services')
      .query({ include: 'nope' })
      .set('Cookie', cookie);
    assert.equal(badInclude.status, 400);
    assert.equal(badInclude.body.errors?.[0]?.code, 'VALIDATION_ERROR');

    const badFk = await request(app)
      .post('/api/v1/services')
      .set('Cookie', cookie)
      .send({
        name: 'Consulta FK',
        professional_id: '00000000-0000-4000-8000-000000000099',
        status: 'pending',
      });
    assert.equal(badFk.status, 400, JSON.stringify(badFk.body));
    assert.equal(badFk.body.errors[0].code, 'VALIDATION_ERROR');
    assert.match(badFk.body.errors[0].message, /Referência inválida/i);
  });

  it('list include create patch by-professional exists', async () => {
    const created = await request(app)
      .post('/api/v1/services')
      .set('Cookie', cookie)
      .send({
        name: 'Consulta',
        professional_id: professionalCode || null,
        associate_user_code: associateCode || null,
        consultation_date: '2026-07-08',
        status: 'pending',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.ok(created.body.data.consultation_date);

    const withInclude = await request(app)
      .get('/api/v1/services')
      .query({
        include: 'professional,associate',
        filter: JSON.stringify({ id: { _eq: id } }),
        limit: 1,
      })
      .set('Cookie', cookie);
    assert.equal(withInclude.status, 200, JSON.stringify(withInclude.body));
    const row = withInclude.body.data[0];
    assert.ok(row);
    assert.ok('professional' in row);
    assert.ok('associate' in row);
    if (professionalCode) {
      assert.equal(row.professional?.professional_code, professionalCode);
    } else {
      assert.equal(row.professional, null);
    }
    if (associateCode) {
      assert.equal(row.associate?.user_code, associateCode);
    } else {
      assert.equal(row.associate, null);
    }

    const patched = await request(app)
      .patch(`/api/v1/services/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'done' });
    assert.equal(patched.status, 200);

    if (professionalCode) {
      const by = await request(app)
        .get(`/api/v1/services/by-professional/${professionalCode}`)
        .query({ include: 'professional' })
        .set('Cookie', cookie);
      assert.equal(by.status, 200);
      const match = by.body.data.find((row) => row.id === id);
      assert.ok(match);
      assert.equal(match.professional?.professional_code, professionalCode);
    }

    if (associateCode && professionalCode) {
      const ex = await request(app)
        .get('/api/v1/services/exists')
        .query({ associate_user_code: associateCode, professional_id: professionalCode })
        .set('Cookie', cookie);
      assert.equal(ex.status, 200);
      assert.equal(ex.body.data.exists, true);
    }
  });
});
