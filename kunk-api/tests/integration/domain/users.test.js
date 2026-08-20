'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { v4: uuidv4 } = require('uuid');

describe('domain/users', () => {
  let app;
  let cookie;
  let userId;
  let userCode;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('creates user via domain', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'Dom', associate_last_name: 'User', email_account: `dom${Date.now()}@t.com` });
    assert.equal(res.status, 201);
    userId = res.body.data.id;
    userCode = res.body.data.user_code;
  });

  it('list with patients and by-code', async () => {
    const listed = await request(app)
      .get('/api/v1/users')
      .query({ patients: '', limit: 5 })
      .set('Cookie', cookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(Array.isArray(listed.body.data));
    assert.ok(Array.isArray(listed.body.data[0]?.patients));

    const s = await request(app).get('/api/v1/users/search').query({ q: 'Dom' }).set('Cookie', cookie);
    assert.equal(s.status, 200);
    const b = await request(app)
      .get(`/api/v1/users/by-code/${userCode}`)
      .query({ patients: '' })
      .set('Cookie', cookie);
    assert.equal(b.status, 200);
    assert.ok(Array.isArray(b.body.data.patients));
  });

  it('nests patients via responsible_code and include=responsible', async () => {
    const patient = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Pac',
        associate_last_name: 'Link',
        email_account: `pac${Date.now()}@t.com`,
        responsible_code: userCode,
      });
    assert.equal(patient.status, 201, JSON.stringify(patient.body));
    assert.equal(patient.body.data.responsible_code, userCode);

    const withPatients = await request(app)
      .get(`/api/v1/users/by-code/${userCode}`)
      .query({ patients: '' })
      .set('Cookie', cookie);
    assert.equal(withPatients.status, 200);
    assert.ok(
      withPatients.body.data.patients.some((p) => p.id === patient.body.data.id),
      'patient should appear under associate'
    );

    const withResponsible = await request(app)
      .get(`/api/v1/users/by-code/${patient.body.data.user_code}`)
      .query({ include: 'responsible', patients: '' })
      .set('Cookie', cookie);
    assert.equal(withResponsible.status, 200, JSON.stringify(withResponsible.body));
    assert.equal(withResponsible.body.data.responsible?.user_code, userCode);
    assert.deepEqual(withResponsible.body.data.patients, []);
  });

  it('patch handbook patients', async () => {
    const h = await request(app)
      .post(`/api/v1/users/${userId}/handbook`)
      .set('Cookie', cookie)
      .send({ handbook: 'ok' });
    assert.equal(h.status, 200);
    const p = await request(app).get(`/api/v1/users/${userId}/patients`).set('Cookie', cookie);
    assert.equal(p.status, 200);
    assert.ok(Array.isArray(p.body.data));
    const u = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Cookie', cookie)
      .send({ annotations: 'x' });
    assert.equal(u.status, 200);
  });

  it('rejects duplicate login email on create and patch; normalizes case', async () => {
    const stamp = Date.now();
    const taken = `panel-taken-${stamp}@test.local`;
    const first = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'Um', email_account: taken });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const dup = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'Dois', email_account: taken.toUpperCase() });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.errors[0].code, 'ACCOUNT_IN_PROGRESS');

    const second = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'Dois', email_account: `panel-free-${stamp}@test.local` });
    assert.equal(second.status, 201, JSON.stringify(second.body));

    const steal = await request(app)
      .patch(`/api/v1/users/${second.body.data.id}`)
      .set('Cookie', cookie)
      .send({ email_account: taken });
    assert.equal(steal.status, 409);
    assert.ok(['ACCOUNT_EXISTS', 'ACCOUNT_IN_PROGRESS'].includes(steal.body.errors[0].code));

    const mixed = `Panel-Case-${stamp}@Test.Local`;
    const renamed = await request(app)
      .patch(`/api/v1/users/${second.body.data.id}`)
      .set('Cookie', cookie)
      .send({ email_account: mixed });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.data.email_account, mixed.trim().toLowerCase());
  });

  it('PATCH rejects funnel and identity fields; make-associate still works', async () => {
    const before = await request(app).get(`/api/v1/items/users/${userId}`).set('Cookie', cookie);
    assert.equal(before.status, 200);
    const prevStatus = before.body.data.status;
    const prevPhase = before.body.data.associate_status;
    const prevCode = before.body.data.user_code;

    const blocked = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Cookie', cookie)
      .send({ associate_status: 'concluido', status: 'Associado', user_code: uuidv4() });
    assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
    assert.equal(blocked.body.errors[0].code, 'VALIDATION_ERROR');

    const mixed = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set('Cookie', cookie)
      .send({ annotations: 'keep-me', associate_status: 'concluido', user_code: uuidv4() });
    assert.equal(mixed.status, 200, JSON.stringify(mixed.body));
    assert.equal(mixed.body.data.annotations, 'keep-me');
    assert.equal(mixed.body.data.associate_status, prevPhase);
    assert.equal(mixed.body.data.user_code, prevCode);
    assert.equal(mixed.body.data.status, prevStatus);

    const made = await request(app)
      .post(`/api/v1/users/${userId}/make-associate`)
      .set('Cookie', cookie)
      .send({});
    assert.equal(made.status, 200, JSON.stringify(made.body));
    assert.equal(made.body.data.status, 'Associado');
    assert.equal(made.body.data.associate_status, 'assinatura_termo');
    assert.equal(made.body.data.user_code, prevCode);

    const handbook = await request(app)
      .post(`/api/v1/users/${userId}/handbook`)
      .set('Cookie', cookie)
      .send({ handbook: 'still-ok' });
    assert.equal(handbook.status, 200, JSON.stringify(handbook.body));
    assert.equal(handbook.body.data.handbook, 'still-ok');
  });
});
