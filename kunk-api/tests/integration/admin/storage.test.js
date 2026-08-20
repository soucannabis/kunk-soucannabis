'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('admin/storage', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /admin/storage returns driver status', async () => {
    const res = await request(app).get('/api/v1/admin/storage').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
    assert.ok(['local', 's3', 'gcs'].includes(res.body.data.driver));
    assert.equal(typeof res.body.data.locked, 'boolean');
    assert.equal(typeof res.body.data.is_cloud, 'boolean');
  });

  it('rejects unauthenticated access to storage', async () => {
    const res = await request(app).get('/api/v1/admin/storage');
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('GET /admin/storage/branding-migration returns migration status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/storage/branding-migration')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
    assert.equal(typeof res.body.data.pending_count, 'number');
    assert.equal(typeof res.body.data.needs_assistant, 'boolean');
    assert.ok(Array.isArray(res.body.data.assets));
  });

  it('POST /admin/storage/migrate-branding requires cloud or no-ops', async () => {
    const statusRes = await request(app).get('/api/v1/admin/storage').set('Cookie', cookie);
    assert.equal(statusRes.status, 200);
    const isCloud = Boolean(statusRes.body.data?.is_cloud);

    const res = await request(app)
      .post('/api/v1/admin/storage/migrate-branding')
      .set('Cookie', cookie)
      .send({});

    if (!isCloud) {
      assert.equal(res.status, 400, JSON.stringify(res.body));
      return;
    }
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data?.branding_migration);
  });
});
