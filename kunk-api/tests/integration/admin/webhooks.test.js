'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { query } = require('../../../src/db/pool');
const { ensureWebhooks } = require('../../../src/db/ensureWebhooks');
const { emitWebhook } = require('../../../src/services/webhooks/emit');
const { processOnce } = require('../../../src/services/webhooks/worker');
const { verifySignature } = require('../../../src/services/webhooks/sign');
const itemsRepository = require('../../../src/repositories/itemsRepository');

describe('admin/webhooks', () => {
  let app;
  let cookie;
  let createdIds = [];
  let receiver;
  let received = [];
  let receiverUrl;
  let failNext = false;

  before(async () => {
    process.env.CONFIG_ENCRYPT_KEY =
      process.env.CONFIG_ENCRYPT_KEY || '0123456789abcdef0123456789abcdef';
    await ensureWebhooks();
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;

    receiver = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        received.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });
        if (failNext) {
          failNext = false;
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('fail');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise((resolve) => {
      receiver.listen(0, '127.0.0.1', resolve);
    });
    const { port } = receiver.address();
    receiverUrl = `http://127.0.0.1:${port}/hook`;
  });

  after(async () => {
    for (const id of createdIds) {
      await query(`DELETE FROM webhook_endpoints WHERE id = $1`, [id]).catch(() => {});
    }
    if (receiver) {
      await new Promise((resolve) => receiver.close(resolve));
    }
  });

  it('CRUD admin: create reveals secret; list does not', async () => {
    const create = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'test-hook',
        url: receiverUrl,
        tables: ['users', 'orders'],
        actions: ['create', 'update'],
        enabled: true,
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    assert.ok(create.body.data.secret);
    assert.ok(create.body.data.endpoint?.id);
    createdIds.push(create.body.data.endpoint.id);

    const list = await request(app).get('/api/v1/admin/webhooks').set('Cookie', cookie);
    assert.equal(list.status, 200);
    const found = (list.body.data || []).find((x) => x.id === create.body.data.endpoint.id);
    assert.ok(found);
    assert.equal(found.secret, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(found, 'secret_encrypted'));
    assert.ok(found.secret_prefix);
  });

  it('emit enqueues only matching endpoints', async () => {
    const createMatch = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'match-orders',
        url: receiverUrl,
        tables: ['orders'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(createMatch.status, 201, JSON.stringify(createMatch.body));
    createdIds.push(createMatch.body.data.endpoint.id);

    const createOther = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'only-users',
        url: receiverUrl,
        tables: ['users'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(createOther.status, 201);
    createdIds.push(createOther.body.data.endpoint.id);

    const result = await emitWebhook({
      table: 'orders',
      action: 'create',
      recordId: '999',
      data: { id: 999, status: 'Aguardando' },
    });
    assert.ok(result.enqueued >= 1);

    const deliveries = await query(
      `SELECT endpoint_id, table_name, action, status
       FROM webhook_deliveries
       WHERE event_id = $1`,
      [result.event_id]
    );
    assert.ok(deliveries.rows.every((r) => r.table_name === 'orders' && r.action === 'create'));
    assert.ok(deliveries.rows.some((r) => r.endpoint_id === createMatch.body.data.endpoint.id));
    assert.ok(!deliveries.rows.some((r) => r.endpoint_id === createOther.body.data.endpoint.id));
  });

  it('worker delivers with valid HMAC and retries on 5xx', async () => {
    received = [];
    const create = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'delivery-hook',
        url: receiverUrl,
        tables: ['services'],
        actions: ['update'],
        enabled: true,
      });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const endpointId = create.body.data.endpoint.id;
    const secret = create.body.data.secret;
    createdIds.push(endpointId);

    // Drain any pending deliveries from earlier tests so this case is isolated.
    for (let i = 0; i < 5; i += 1) {
      const drained = await processOnce(50);
      if (!drained.claimed) break;
    }
    received = [];

    failNext = true;
    const emitResult = await emitWebhook({
      table: 'services',
      action: 'update',
      recordId: '1',
      data: { id: 1, name: 'svc' },
    });
    assert.ok(emitResult.enqueued >= 1);

    const first = await processOnce(50);
    assert.ok(first.claimed >= 1);
    assert.ok(first.failed >= 1 || first.dead >= 0);
    assert.ok(received.length >= 1);

    // Force retry immediately for this endpoint only
    await query(
      `UPDATE webhook_deliveries
       SET next_attempt_at = NOW() - INTERVAL '1 second', status = 'failed'
       WHERE endpoint_id = $1 AND status = 'failed'`,
      [endpointId]
    );

    const beforeRetry = received.length;
    const second = await processOnce(50);
    assert.ok(second.delivered >= 1);
    assert.ok(received.length > beforeRetry);

    const last = received[received.length - 1];
    const ts = last.headers['x-kunk-timestamp'];
    const sig = last.headers['x-kunk-signature'];
    assert.ok(verifySignature(secret, last.body, ts, sig));
  });

  it('domain mutation via itemsRepository enqueues delivery', async () => {
    const create = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'reception-hook',
        url: receiverUrl,
        tables: ['reception'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(create.status, 201);
    createdIds.push(create.body.data.endpoint.id);

    const before = await query(
      `SELECT COUNT(*)::int AS c FROM webhook_deliveries WHERE endpoint_id = $1`,
      [create.body.data.endpoint.id]
    );

    // Minimal reception insert (columns vary; use items path with required-ish fields)
    const row = await itemsRepository.createItem('reception', {
      name: 'Webhook Test',
      email: `webhook-test-${Date.now()}@example.com`,
      status: 'pending',
      date_created: new Date().toISOString(),
    });

    // emit is fire-and-forget; allow a tick
    await new Promise((r) => setTimeout(r, 50));

    const after = await query(
      `SELECT COUNT(*)::int AS c FROM webhook_deliveries WHERE endpoint_id = $1`,
      [create.body.data.endpoint.id]
    );
    assert.ok(after.rows[0].c > before.rows[0].c);

    if (row?.id) {
      await query(`DELETE FROM reception WHERE id = $1`, [row.id]).catch(() => {});
    }
  });

  it('test endpoint delivers ping and returns clear result', async () => {
    const create = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'ping-hook',
        url: receiverUrl,
        tables: ['users'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(create.status, 201);
    createdIds.push(create.body.data.endpoint.id);

    const test = await request(app)
      .post(`/api/v1/admin/webhooks/${create.body.data.endpoint.id}/test`)
      .set('Cookie', cookie);
    assert.equal(test.status, 200, JSON.stringify(test.body));
    assert.equal(test.body.data.ok, true);
    assert.match(test.body.data.message, /sucesso/i);
    assert.equal(test.body.data.delivery.table_name, 'ping');
    assert.equal(test.body.data.delivery.action, 'test');
    assert.equal(test.body.data.delivery.status, 'delivered');
  });

  it('test endpoint returns clear error when destination rejects', async () => {
    failNext = true;
    const create = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'ping-fail-hook',
        url: receiverUrl,
        tables: ['users'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(create.status, 201);
    createdIds.push(create.body.data.endpoint.id);

    const test = await request(app)
      .post(`/api/v1/admin/webhooks/${create.body.data.endpoint.id}/test`)
      .set('Cookie', cookie);
    assert.equal(test.status, 502, JSON.stringify(test.body));
    assert.equal(test.body.errors[0].code, 'WEBHOOK_TEST_FAILED');
    assert.match(test.body.errors[0].message, /Teste falhou/i);
    assert.match(test.body.errors[0].message, /HTTP 500/);
    assert.doesNotMatch(test.body.errors[0].message, /\bfail\b/);
    assert.doesNotMatch(JSON.stringify(test.body.errors[0].details || {}), /\bfail\b/);
  });

  it('rejects internal webhook URLs', async () => {
    const metadata = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'ssrf-meta',
        url: 'http://169.254.169.254/latest/meta-data',
        tables: ['users'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(metadata.status, 400, JSON.stringify(metadata.body));
    assert.match(String(metadata.body.errors?.[0]?.message || ''), /interna/i);

    const lan = await request(app)
      .post('/api/v1/admin/webhooks')
      .set('Cookie', cookie)
      .send({
        name: 'ssrf-lan',
        url: 'http://192.168.0.20/hook',
        tables: ['users'],
        actions: ['create'],
        enabled: true,
      });
    assert.equal(lan.status, 400, JSON.stringify(lan.body));
  });
});
