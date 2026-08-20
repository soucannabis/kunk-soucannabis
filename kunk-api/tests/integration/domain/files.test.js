'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin, extractAssociateCookie } = require('../../helpers/auth');
const { v4: uuidv4 } = require('uuid');
const { TINY_JPEG, TINY_PDF, TINY_SVG } = require('../../helpers/fileBuffers');

describe('domain/files', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('upload get download attach detach delete', async () => {
    const upload = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .attach('file', TINY_JPEG, { filename: 'hello.jpg', contentType: 'image/jpeg' });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    const id = upload.body.data.id;

    const meta = await request(app).get(`/api/v1/files/${id}`).set('Cookie', cookie);
    assert.equal(meta.status, 200);

    const dl = await request(app).get(`/api/v1/files/${id}/download`).set('Cookie', cookie);
    assert.equal(dl.status, 200);
    assert.equal(dl.headers['x-content-type-options'], 'nosniff');
    assert.equal(dl.headers['content-type'], 'image/jpeg');
    assert.match(String(dl.headers['content-disposition'] || ''), /^inline;/);

    const user = await request(app)
      .post('/api/v1/items/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'F', user_code: uuidv4() });
    assert.equal(user.status, 201);

    const attach = await request(app)
      .post(`/api/v1/files/${id}/attach`)
      .set('Cookie', cookie)
      .send({ collection: 'users', item_id: user.body.data.id });
    assert.equal(attach.status, 201);

    const detach = await request(app)
      .delete(`/api/v1/files/${id}/attach`)
      .set('Cookie', cookie)
      .send({ collection: 'users', item_id: user.body.data.id });
    assert.equal(detach.status, 200);

    const del = await request(app).delete(`/api/v1/files/${id}`).set('Cookie', cookie);
    assert.equal(del.status, 200);
  });

  it('operator upload succeeds even with stale associate_session cookie', async () => {
    const staleAssociate = 'associate_session=stale-or-expired-token';
    const upload = await request(app)
      .post('/api/v1/files')
      .set('Cookie', `${cookie}; ${staleAssociate}`)
      .set('X-Kunk-App', 'admin')
      .attach('file', TINY_PDF, { filename: 'comprovante.pdf', contentType: 'application/pdf' });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    assert.ok(upload.body.data?.id);
    await request(app).delete(`/api/v1/files/${upload.body.data.id}`).set('Cookie', cookie);
  });

  it('operator upload with user_id + doc_kind and list by user', async () => {
    const user = await request(app)
      .post('/api/v1/items/users')
      .set('Cookie', cookie)
      .send({ associate_name: 'Rx', associate_last_name: 'Test', user_code: uuidv4() });
    assert.equal(user.status, 201, JSON.stringify(user.body));
    const userId = user.body.data.id;

    const upload = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .field('user_id', String(userId))
      .field('doc_kind', 'prescription')
      .field('filename', `receita-Rx-Test-${user.body.data.user_code}.pdf`)
      .attach('file', TINY_PDF, { filename: 'scan.pdf', contentType: 'application/pdf' });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    assert.equal(upload.body.data.doc_kind, 'prescription');

    const listed = await request(app)
      .get(`/api/v1/files?user_id=${userId}&doc_kind=prescription`)
      .set('Cookie', cookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok((listed.body.data || []).some((f) => f.id === upload.body.data.id));

    await request(app).delete(`/api/v1/files/${upload.body.data.id}`).set('Cookie', cookie);
  });

  it('rejects svg even when the client sends image/png', async () => {
    const spoof = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .attach('file', TINY_SVG, { filename: 'logo.png', contentType: 'image/png' });
    assert.equal(spoof.status, 400);
    assert.equal(spoof.body.errors[0].code, 'UNSUPPORTED_FILE_TYPE');

    const svg = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .attach('file', TINY_SVG, { filename: 'x.svg', contentType: 'image/svg+xml' });
    assert.equal(svg.status, 400);
    assert.equal(svg.body.errors[0].code, 'UNSUPPORTED_FILE_TYPE');
  });

  it('operator download works with associate_session in the same cookie jar', async () => {
    const email = `files-dual-${Date.now()}@test.local`;
    const reg = await request(app)
      .post('/api/v1/auth/associate/register-email')
      .send({ email, password: 'TestPass123!' });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const assocCookie = extractAssociateCookie(reg.headers['set-cookie']);
    assert.ok(assocCookie);

    const upload = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .attach('file', TINY_PDF, { filename: 'termo.pdf', contentType: 'application/pdf' });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    const fileId = upload.body.data.id;

    const dual = await request(app)
      .get(`/api/v1/files/${fileId}/download`)
      .set('Cookie', `${cookie}; ${assocCookie}`);
    assert.equal(dual.status, 200, JSON.stringify(dual.body));
    assert.equal(dual.headers['content-type'], 'application/pdf');

    const meta = await request(app)
      .get(`/api/v1/files/${fileId}`)
      .set('Cookie', `${cookie}; ${assocCookie}`);
    assert.equal(meta.status, 200, JSON.stringify(meta.body));

    const denied = await request(app)
      .get(`/api/v1/files/${fileId}/download`)
      .set('Cookie', assocCookie);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.errors[0].code, 'FORBIDDEN');

    const ownUserId = reg.body.data.user.id;
    await request(app)
      .post(`/api/v1/files/${fileId}/attach`)
      .set('Cookie', cookie)
      .send({ collection: 'users', item_id: ownUserId, doc_kind: 'identity' });

    const own = await request(app)
      .get(`/api/v1/files/${fileId}/download`)
      .set('Cookie', assocCookie);
    assert.equal(own.status, 200, JSON.stringify(own.body));

    await request(app).delete(`/api/v1/files/${fileId}`).set('Cookie', cookie);
  });
});
