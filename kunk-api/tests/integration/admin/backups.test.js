'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('admin/storage backups', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('GET /admin/storage includes backup config block', async () => {
    const res = await request(app).get('/api/v1/admin/storage').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.backup);
    assert.equal(typeof res.body.data.backup.enabled, 'boolean');
    assert.equal(typeof res.body.data.backup.editable, 'boolean');
    assert.ok(res.body.data.backup.schedule_time);
  });

  it('GET /admin/storage/backups returns list (max 5)', async () => {
    const res = await request(app).get('/api/v1/admin/storage/backups').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data.backups));
    assert.ok(res.body.data.backups.length <= 5);
  });

  it('rejects backup run and config when bucket is not active', async () => {
    const status = await request(app).get('/api/v1/admin/storage').set('Cookie', cookie);
    // Sem bucket ativo não dá para exercitar dump/upload; só valida o guard.
    if (status.body.data?.backup?.editable) return;

    const run = await request(app)
      .post('/api/v1/admin/storage/backups/run')
      .set('Cookie', cookie);
    assert.equal(run.status, 400, JSON.stringify(run.body));

    const cfg = await request(app)
      .put('/api/v1/admin/storage/backup-config')
      .set('Cookie', cookie)
      .send({ enabled: true, schedule_time: '04:00', retention_count: 5 });
    assert.equal(cfg.status, 400, JSON.stringify(cfg.body));
  });

  it('rejects unauthenticated access to backups', async () => {
    const res = await request(app).get('/api/v1/admin/storage/backups');
    assert.ok(res.status === 401 || res.status === 403);
  });
});
