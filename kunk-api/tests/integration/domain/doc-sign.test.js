'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp } = require('../../helpers/app');
const { query, ensureAdminUser, cleanupTestLocalUsers } = require('../../helpers/db');
const { loginAsAdmin, extractAssociateCookie } = require('../../helpers/auth');
const { resetRateLimits } = require('../../../src/utils/rateLimit');
const { ensureDocSignLogo } = require('../../helpers/integrationEnv');

describe('doc-sign integration', () => {
  let app;

  before(async () => {
    app = getApp();
    resetRateLimits();
    await ensureAdminUser();
    await cleanupTestLocalUsers();
  });

  it('publish templates, create contract, sign and advance phase', async () => {
    const { cookie: adminCookie } = await loginAsAdmin();

    for (const kind of ['self', 'with_patient']) {
      const tpl = await request(app)
        .get(`/api/v1/doc-sign/templates/${kind}`)
        .set('Cookie', adminCookie);
      assert.equal(tpl.status, 200);
      assert.ok(tpl.body.data.draft_content_json);

      await ensureDocSignLogo(app, adminCookie, kind);

      const pub = await request(app)
        .post(`/api/v1/doc-sign/templates/${kind}/publish`)
        .set('Cookie', adminCookie)
        .send({ notes: 'test publish' });
      assert.equal(pub.status, 201, JSON.stringify(pub.body));
      assert.ok(pub.body.data.version?.pdf_file_id);
    }

    const email = `docsign-${Date.now()}@test.local`;
    const password = 'TestPass123!';
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password });
    assert.equal(reg.status, 201);
    const cookie = reg.headers['set-cookie'];
    const userCode = reg.body.data.user.user_code;

    await query(
      `UPDATE users SET
         associate_status = 'assinatura_termo',
         associate_name = 'Paulo',
         associate_last_name = 'Teste',
         associate_cpf = '123.456.789-00',
         associate_rg = '123',
         associate_rg_issuer = 'SSP',
         nationality = 'brasileiro(a)',
         marital_status = 'Solteiro',
         street = 'Rua A',
         street_number = '10',
         city = 'Anápolis',
         neighborhood = 'Centro',
         state = 'GO',
         cep = '75000-000',
         responsible_type = 'himself'
       WHERE user_code = $1`,
      [userCode]
    );

    const created = await request(app)
      .post('/api/v1/doc-sign/contracts')
      .set('Cookie', cookie)
      .send({});
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.status, 'pending');
    assert.ok(created.body.data.signing_url);
    const token = created.body.data.signing_url.split('/assinar/')[1];

    const list = await request(app)
      .get('/api/v1/doc-sign/contracts')
      .set('Cookie', adminCookie);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok((list.body.data || []).some((c) => c.id === created.body.data.id));

    const signPayload = await request(app).get(`/api/v1/doc-sign/sign/${token}`);
    assert.equal(signPayload.status, 200, JSON.stringify(signPayload.body));
    assert.ok(signPayload.body.data.content_json);
    assert.equal(signPayload.body.data.content_json.type, 'doc');
    assert.ok(signPayload.body.data.title);

    const view = await request(app)
      .post(`/api/v1/doc-sign/sign/${token}/view`)
      .send({ timezone: 'America/Sao_Paulo' });
    assert.equal(view.status, 200);

    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const complete = await request(app)
      .post(`/api/v1/doc-sign/sign/${token}/complete`)
      .send({
        method: 'draw',
        signature_image_base64: png,
        consent: true,
        timezone: 'America/Sao_Paulo',
      });
    assert.equal(complete.status, 200, JSON.stringify(complete.body));
    assert.equal(complete.body.data.status, 'completed');

    const me = await request(app).get('/api/v1/auth/associate/me').set('Cookie', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.associate_status, 'assinatura_termo');
    assert.equal(me.body.data.user.status, 'Associado');
    assert.ok(me.body.data.user.adhesion_term);

    const again = await request(app)
      .post('/api/v1/doc-sign/contracts')
      .set('Cookie', cookie)
      .send({});
    assert.equal(again.status, 409);
    assert.equal(again.body.errors[0].code, 'CONTRACT_ALREADY_COMPLETED');

    const staffAgain = await request(app)
      .post('/api/v1/doc-sign/contracts')
      .set('Cookie', adminCookie)
      .send({ user_code: userCode, regenerate: true });
    assert.equal(staffAgain.status, 409);

    const assocCookie = extractAssociateCookie(cookie);
    const signedFileId = String(complete.body.data.signed_pdf_url || '').match(/files\/([^/]+)\/download/)?.[1];
    const auditFileId = String(complete.body.data.audit_pdf_url || '').match(/files\/([^/]+)\/download/)?.[1];
    assert.ok(signedFileId, JSON.stringify(complete.body.data));
    assert.ok(auditFileId, JSON.stringify(complete.body.data));

    const signedAsStaff = await request(app)
      .get(`/api/v1/files/${signedFileId}/download`)
      .set('Cookie', `${adminCookie}; ${assocCookie}`);
    assert.equal(signedAsStaff.status, 200, JSON.stringify(signedAsStaff.body));

    const auditAsStaff = await request(app)
      .get(`/api/v1/files/${auditFileId}/download`)
      .set('Cookie', `${adminCookie}; ${assocCookie}`);
    assert.equal(auditAsStaff.status, 200, JSON.stringify(auditAsStaff.body));

    const signedAsOwner = await request(app)
      .get(`/api/v1/files/${signedFileId}/download`)
      .set('Cookie', assocCookie);
    assert.equal(signedAsOwner.status, 200, JSON.stringify(signedAsOwner.body));

    const auditAsOwner = await request(app)
      .get(`/api/v1/files/${auditFileId}/download`)
      .set('Cookie', assocCookie);
    assert.equal(auditAsOwner.status, 200, JSON.stringify(auditAsOwner.body));

    const other = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email: `docsign-other-${Date.now()}@test.local`, password: 'TestPass123!' });
    assert.equal(other.status, 201);
    const otherCookie = extractAssociateCookie(other.headers['set-cookie']);
    const stolen = await request(app)
      .get(`/api/v1/files/${signedFileId}/download`)
      .set('Cookie', otherCookie);
    assert.equal(stolen.status, 403);

    await cleanupTestLocalUsers();
  });
});
