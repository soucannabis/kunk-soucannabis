'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../helpers/auth');
const { TINY_JPEG } = require('../helpers/fileBuffers');

describe('files list', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /files returns paginated list', async () => {
    const created = await request(app)
      .post('/api/v1/files')
      .set('Cookie', cookie)
      .attach('file', TINY_JPEG, 'admin-list.jpg');
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const listed = await request(app)
      .get('/api/v1/files?limit=10&offset=0')
      .set('Cookie', cookie);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(Array.isArray(listed.body.data));
    assert.ok(listed.body.meta);
    assert.ok(listed.body.data.some((f) => f.filename === 'admin-list.jpg'));
  });
});
