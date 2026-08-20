'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp } = require('../../helpers/app');
const { closePool, query, cleanupTestLocalUsers } = require('../../helpers/db');
const { loginAsAdmin, extractAssociateCookie, extractCookie } = require('../../helpers/auth');
const { env } = require('../../../src/config/env');
const { resetRateLimits } = require('../../../src/utils/rateLimit');
const { PHASE, phaseIndex } = require('../../../src/constants/associatePhases');
const { TINY_JPEG } = require('../../helpers/fileBuffers');
const { sha256Hex } = require('../../../src/utils/tokenHash');
const crypto = require('crypto');

const VALID_CPF = '52998224725';

function belowDocumentos(status) {
  return phaseIndex(status) < phaseIndex(PHASE.DOCUMENTOS);
}

function responsiblePayload(overrides = {}) {
  return {
    responsible_type: 'himself',
    associate_name: 'Ana',
    associate_last_name: 'Silva',
    associate_birth_date: '1990-01-15',
    gender: 'mulher-cis',
    nationality: 'Brasileira',
    associate_cpf: VALID_CPF,
    associate_rg: '1234567',
    associate_rg_issuer: 'SSP/SP',
    marital_status: 'Solteiro',
    account_password: 'senha123',
    mobile_number: '5511999999999',
    street: 'Rua A',
    street_number: '100',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    cep: '01310100',
    reason_treatment_text: 'Dor crônica',
    ciap_codes: ['A01', 'P01'],
    ...overrides,
  };
}

describe('registration funnel', () => {
  let app;
  let email;

  before(async () => {
    // Não truncar o banco: preserva sample data. Isolamento via e-mails @test.local.
    app = getApp();
    email = `reg-${Date.now()}@test.local`;
  });

  beforeEach(() => {
    resetRateLimits();
  });

  after(async () => {
    try {
      await cleanupTestLocalUsers();
    } catch {
      /* best-effort */
    }
    await closePool();
  });

  it('auth: register → me → logout → login; 409 exists/in_progress; forgot/reset', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'senha12345' });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.equal(reg.body.data.user.associate_status, PHASE.CADASTRO_CRIADO);
    assert.equal(reg.body.data.user.status, PHASE.CADASTRO_CRIADO);
    assert.ok(!reg.body.data.user.account_password);
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);
    assert.ok(cookie.startsWith('associate_session='));
    const rawSession = cookie.slice('associate_session='.length);
    const storedSession = await query(
      `SELECT session_token FROM users WHERE email_account = $1`,
      [email]
    );
    assert.equal(storedSession.rows[0].session_token, sha256Hex(rawSession));
    assert.notEqual(storedSession.rows[0].session_token, rawSession);

    const me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email_account, email);

    const again = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'senha12345' });
    assert.equal(again.status, 409);
    assert.equal(again.body.errors[0].code, 'ACCOUNT_IN_PROGRESS');

    await request(app).post('/api/v1/auth/associate/logout').set('Cookie', cookie);

    // set password via patch then login
    const reg2 = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `other-${Date.now()}@test.local`, password: 'senha12345' });
    const c2 = extractAssociateCookie(reg2.headers['set-cookie']);
    await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', c2)
      .send(responsiblePayload());

    const loginEmail = reg2.body.data.user.email_account;
    await request(app).post('/api/v1/auth/associate/logout').set('Cookie', c2);

    const login = await request(app)
      .post('/api/v1/auth/associate/login')
      .send({ email: loginEmail, password: 'senha123' });
    assert.equal(login.status, 200);
    assert.ok(extractAssociateCookie(login.headers['set-cookie']));

    const forgot = await request(app)
      .post('/api/v1/auth/associate/forgot-password')
      .send({ email: loginEmail });
    assert.equal(forgot.status, 200);
    assert.ok(forgot.body.data.reset_token);

    const reset = await request(app)
      .post('/api/v1/auth/associate/reset-password')
      .send({ token: forgot.body.data.reset_token, password: 'novaSenha1' });
    assert.equal(reset.status, 200);

    const loginNew = await request(app)
      .post('/api/v1/auth/associate/login')
      .send({ email: loginEmail, password: 'novaSenha1' });
    assert.equal(loginNew.status, 200);

    // ACCOUNT_EXISTS when Associado
    await query(`UPDATE users SET status = 'Associado' WHERE email_account = $1`, [email]);
    const existsConflict = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'senha12345' });
    assert.equal(existsConflict.status, 409);
    assert.equal(existsConflict.body.errors[0].code, 'ACCOUNT_EXISTS');
  });

  it('rejects leftover plaintext associate password; forgot+reset recovers', async () => {
    const email = `plain-assoc-${Date.now()}@test.local`;
    const leftover = 'senha12345';
    const userCode = crypto.randomUUID();
    await query(
      `INSERT INTO users (email_account, account_password, associate_status, status, user_code, date_created)
       VALUES ($1, $2, $3, $3, $4, NOW())`,
      [email, leftover, PHASE.CADASTRO_CRIADO, userCode]
    );

    const denied = await request(app)
      .post('/api/v1/auth/associate/login')
      .send({ email, password: leftover });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.errors[0].code, 'INVALID_CREDENTIALS');

    const forgot = await request(app).post('/api/v1/auth/associate/forgot-password').send({ email });
    assert.equal(forgot.status, 200, JSON.stringify(forgot.body));
    assert.ok(forgot.body.data.reset_token);

    const reset = await request(app)
      .post('/api/v1/auth/associate/reset-password')
      .send({ token: forgot.body.data.reset_token, password: 'novaSenha1' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const login = await request(app)
      .post('/api/v1/auth/associate/login')
      .send({ email, password: 'novaSenha1' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  });

  it('PATCH /users/me saves only valid fields', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `patch-${Date.now()}@test.local`, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Ana',
        associate_cpf: '000',
        cep: '',
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.meta.saved_fields.includes('associate_name'));
    assert.ok(res.body.meta.invalid_fields.includes('associate_cpf'));
    assert.equal(res.body.data.associate_name, 'Ana');
  });

  it('PATCH /users/me ignores email_account', async () => {
    const email = `no-email-patch-${Date.now()}@test.local`;
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);

    const onlyEmail = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email_account: `taken-${Date.now()}@test.local` });
    assert.equal(onlyEmail.status, 400);
    assert.equal(onlyEmail.body.errors[0].code, 'VALIDATION_ERROR');

    const withName = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Ana',
        email_account: `other-${Date.now()}@test.local`,
      });
    assert.equal(withName.status, 200, JSON.stringify(withName.body));
    assert.equal(withName.body.data.email_account, email);
    assert.ok(!withName.body.meta.saved_fields.includes('email_account'));
  });

  it('register-email 409 when leftover login row has no funnel phase', async () => {
    const email = `none-state-${Date.now()}@test.local`;
    await query(
      `INSERT INTO users (email_account, user_code, date_created) VALUES ($1, $2, NOW())`,
      [email, crypto.randomUUID()]
    );
    const res = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'senha12345' });
    assert.equal(res.status, 409);
    assert.equal(res.body.errors[0].code, 'ACCOUNT_EXISTS');
  });

  it('patients: create parcial → patch → list', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `pat-${Date.now()}@test.local`, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);
    await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send(responsiblePayload({ responsible_type: 'another' }));

    const created = await request(app)
      .post('/api/v1/users/me/patients')
      .set('Cookie', cookie)
      .send({ associate_name: 'João' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'patient');
    assert.equal(created.body.data.email_account, reg.body.data.user.email_account);
    const patientId = created.body.data.id;

    const patched = await request(app)
      .patch(`/api/v1/users/me/patients/${patientId}`)
      .set('Cookie', cookie)
      .send({
        associate_last_name: 'Souza',
        associate_birth_date: '2010-05-01',
        gender: 'homem-cis',
        nationality: 'Brasileira',
        associate_cpf: VALID_CPF,
        associate_rg: '7654321',
        associate_rg_issuer: 'SSP/SP',
        ciap_codes: ['N01'],
        reason_treatment_text: 'Cefaleia',
      });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.associate_last_name, 'Souza');

    const list = await request(app).get('/api/v1/users/me/patients').set('Cookie', cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
  });

  it('pet: creates a lightweight patient and advances without patient identity documents', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `pet-${Date.now()}@test.local`, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);

    const responsible = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send(
        responsiblePayload({
          responsible_type: 'pet',
          reason_treatment_text: undefined,
          ciap_codes: undefined,
        })
      );
    assert.equal(responsible.status, 200, JSON.stringify(responsible.body));
    assert.equal(responsible.body.data.associate_status, PHASE.DADOS_PESSOAIS);

    const pet = await request(app)
      .post('/api/v1/users/me/patients')
      .set('Cookie', cookie)
      .send({
        associate_name: 'Bidu',
        associate_birth_date: '2020-03-15',
        gender: 'macho',
        reason_treatment_text: 'Tratamento veterinário contínuo',
      });
    assert.equal(pet.status, 201, JSON.stringify(pet.body));
    assert.deepEqual(pet.body.meta.invalid_fields, []);
    assert.equal(pet.body.data.gender, 'macho');

    const advance = await request(app)
      .post('/api/v1/users/me/advance')
      .set('Cookie', cookie);
    assert.equal(advance.status, 200, JSON.stringify(advance.body));
    assert.equal(advance.body.data.associate_status, PHASE.DOCUMENTOS);

    const docs = await request(app)
      .get('/api/v1/users/me/documents/status')
      .set('Cookie', cookie);
    assert.equal(docs.status, 200);
    assert.equal(docs.body.data.patient, null);
  });

  it('files + documents/status: RG incomplete vs complete; CNH', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `docs-${Date.now()}@test.local`, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);
    await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send(responsiblePayload());
    await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
    // may already be dados_pessoais from patch; advance to documentos
    let me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    while (belowDocumentos(me.body.data.user.associate_status)) {
      const adv = await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
      assert.ok([200, 400].includes(adv.status));
      if (adv.status !== 200) break;
      me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    }
    assert.equal(me.body.data.user.associate_status, PHASE.DOCUMENTOS);

    const incomplete = await request(app)
      .get('/api/v1/users/me/documents/status')
      .set('Cookie', cookie);
    assert.equal(incomplete.status, 200);
    assert.equal(incomplete.body.data.complete, false);

    await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .field('doc_type', 'rg')
      .field('side', 'front')
      .field('subject', 'responsible')
      .field('doc_kind', 'identity')
      .attach('file', TINY_JPEG, 'rg-front.jpg');

    const mid = await request(app).get('/api/v1/users/me/documents/status').set('Cookie', cookie);
    assert.equal(mid.body.data.complete, false);

    await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .field('doc_type', 'rg')
      .field('side', 'back')
      .field('subject', 'responsible')
      .field('doc_kind', 'identity')
      .attach('file', TINY_JPEG, 'rg-back.jpg');

    const done = await request(app).get('/api/v1/users/me/documents/status').set('Cookie', cookie);
    assert.equal(done.body.data.complete, true);
    assert.equal(done.body.data.responsible.mode, 'rg');

    // CNH path on fresh user
    const reg2 = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `cnh-${Date.now()}@test.local`, password: 'senha12345' });
    const c2 = extractAssociateCookie(reg2.headers['set-cookie']);
    await request(app).patch('/api/v1/users/me').set('Cookie', c2).send(responsiblePayload());
    let me2 = await request(app).get('/api/v1/auth/associate/me').set('Cookie', c2);
    while (belowDocumentos(me2.body.data.user.associate_status)) {
      await request(app).post('/api/v1/users/me/advance').set('Cookie', c2);
      me2 = await request(app).get('/api/v1/auth/associate/me').set('Cookie', c2);
    }
    await request(app)
      .post('/api/v1/files')
      .set('Cookie', c2)
      .field('doc_type', 'cnh')
      .field('side', 'front')
      .field('subject', 'responsible')
      .field('doc_kind', 'identity')
      .attach('file', TINY_JPEG, 'cnh.jpg');
    const cnhStatus = await request(app).get('/api/v1/users/me/documents/status').set('Cookie', c2);
    assert.equal(cnhStatus.body.data.complete, true);
    assert.equal(cnhStatus.body.data.responsible.mode, 'cnh');
  });

  it('advance documentos→assinatura_termo; block without docs or unsigned term; complete', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `adv-${Date.now()}@test.local`, password: 'senha12345' });
    const cookie = extractAssociateCookie(reg.headers['set-cookie']);
    await request(app).patch('/api/v1/users/me').set('Cookie', cookie).send(responsiblePayload());

    let me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    while (belowDocumentos(me.body.data.user.associate_status)) {
      const adv = await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
      assert.equal(adv.status, 200);
      me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    }

    const blocked = await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
    assert.equal(blocked.status, 400);

    await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .field('doc_type', 'cnh')
      .field('side', 'front')
      .field('subject', 'responsible')
      .field('doc_kind', 'identity')
      .attach('file', TINY_JPEG, 'cnh.jpg');

    const toTerm = await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
    assert.equal(toTerm.status, 200);
    assert.equal(toTerm.body.data.associate_status, PHASE.ASSINATURA_TERMO);

    const terms = await request(app).get('/api/v1/terms/status');
    assert.equal(terms.status, 200);
    assert.equal(terms.body.data.status, 'ready');

    const contractsUnauth = await request(app).post('/api/v1/terms/contracts').send({});
    assert.equal(contractsUnauth.status, 401);

    const noBypass = await request(app).post('/api/v1/users/me/advance').set('Cookie', cookie);
    assert.equal(noBypass.status, 400);
    assert.equal(noBypass.body.errors[0].code, 'VALIDATION_ERROR');

    // Associado só depois da assinatura; aqui força o status para testar complete.
    await query(
      `UPDATE users SET status = 'Associado', associate_status = $2 WHERE email_account = $1`,
      [reg.body.data.user.email_account, PHASE.ASSINATURA_TERMO]
    );
    const done = await request(app).post('/api/v1/users/me/complete').set('Cookie', cookie);
    assert.equal(done.status, 200);
    assert.equal(done.body.data.status, 'Associado');
    assert.equal(done.body.data.associate_status, PHASE.CONCLUIDO);
  });

  it('guards: operator cookie cannot use associate routes; associate cannot use operator users list', async () => {
    const { cookie: opCookie } = await loginAsAdmin();
    const denied = await request(app).get('/api/v1/auth/associate/me').set('Cookie', opCookie);
    assert.equal(denied.status, 401);

    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `guard-${Date.now()}@test.local`, password: 'senha12345' });
    const assocCookie = extractAssociateCookie(reg.headers['set-cookie']);
    const usersList = await request(app).get('/api/v1/users').set('Cookie', assocCookie);
    assert.equal(usersList.status, 401);

    // exists public
    const exists = await request(app).get('/api/v1/users/exists').query({ email: reg.body.data.user.email_account });
    assert.equal(exists.status, 200);
    assert.equal(exists.body.data.state, 'in_progress');
  });

  it('rate-limits GET /users/exists after 5 hits per IP', async () => {
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    try {
      const probe = `exists-rl-${Date.now()}@test.local`;
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get('/api/v1/users/exists').query({ email: probe });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.data.exists, false);
        assert.equal(res.body.data.state, 'none');
      }
      const limited = await request(app).get('/api/v1/users/exists').query({ email: probe });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
    } finally {
      env.authEnumRateLimit = prev;
    }
  });

  it('rate-limits POST /auth/associate/register-email after 5 hits per IP', async () => {
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    try {
      const stamp = Date.now();
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/associate/register-email')
          .send({ email: `reg-rl-${stamp}-${i}@test.local`, password: 'senha12345' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
      }
      const limited = await request(app)
        .post('/api/v1/auth/associate/register-email')
        .send({ email: `reg-rl-${stamp}-overflow@test.local`, password: 'senha12345' });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
    } finally {
      env.authEnumRateLimit = prev;
    }
  });

  it('rate-limits associate login after 5 failures per IP+email; successes do not count', async () => {
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    try {
      const email = `login-rl-${Date.now()}@test.local`;
      const password = 'senha12345';
      const reg = await request(app)
        .post('/api/v1/auth/associate/register-email')
        .send({ email, password });
      assert.equal(reg.status, 201, JSON.stringify(reg.body));
      await request(app).post('/api/v1/auth/associate/logout').set('Cookie', extractAssociateCookie(reg.headers['set-cookie']));

      for (let i = 0; i < 3; i++) {
        const okLogin = await request(app).post('/api/v1/auth/associate/login').send({ email, password });
        assert.equal(okLogin.status, 200, JSON.stringify(okLogin.body));
      }
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/associate/login')
          .send({ email, password: 'wrong-password' });
        assert.equal(res.status, 401, JSON.stringify(res.body));
        assert.equal(res.body.errors[0].code, 'INVALID_CREDENTIALS');
      }
      const limited = await request(app)
        .post('/api/v1/auth/associate/login')
        .send({ email, password: 'wrong-password' });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
    } finally {
      env.authEnumRateLimit = prev;
    }
  });
});
