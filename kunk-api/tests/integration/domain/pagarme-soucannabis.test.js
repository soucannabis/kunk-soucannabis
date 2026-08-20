'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { ensureAdminUser, query } = require('../../helpers/db');
const { skipIfMissingTable, repairCorruptEmailCredentials } = require('../../helpers/integrationEnv');

function errCode(res) {
  return res.body?.errors?.[0]?.code || res.body?.error?.code;
}

describe('domain/pagarme + soucannabis_orders admin gates', () => {
  let app;
  let cookie;

  before(async () => {
    await ensureAdminUser();
    await repairCorruptEmailCredentials();
    await query(`
      INSERT INTO system_api_credentials (service, field_key, encrypted_value, env_fallback, is_secret, description)
      VALUES
        ('pagarme', 'secret_key', NULL, 'PAGARME_SECRET_KEY', true, 't'),
        ('soucannabis_orders', 'base_url', NULL, 'SOUCANNABIS_ORDERS_BASE_URL', false, 't'),
        ('soucannabis_orders', 'client_id', NULL, 'SOUCANNABIS_ORDERS_CLIENT_ID', true, 't'),
        ('soucannabis_orders', 'client_secret', NULL, 'SOUCANNABIS_ORDERS_CLIENT_SECRET', true, 't')
      ON CONFLICT (service, field_key) DO NOTHING;
    `);
    // Reset module flags so tests are isolated from previous runs.
    await query(`
      INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, description)
      VALUES
        ('modules', 'modules.pagarme.enabled', 'false', 'boolean', false, false, 't'),
        ('modules', 'modules.soucannabis_orders.enabled', 'false', 'boolean', false, false, 't')
      ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value;
    `);
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('lists pagarme and soucannabis_orders in external services', async () => {
    const res = await request(app).get('/api/v1/admin/external-services').set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const names = (res.body.data?.services || []).map((s) => s.service);
    assert.ok(names.includes('pagarme'));
    assert.ok(names.includes('soucannabis_orders'));
  });

  it('GET soucannabis_orders returns enabled false when module flag is off', async () => {
    await query(`
      INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, description)
      VALUES ('modules', 'modules.soucannabis_orders.enabled', 'false', 'boolean', false, false, 't')
      ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value;
    `);
    const res = await request(app)
      .get('/api/v1/admin/external-services/soucannabis_orders')
      .set('Cookie', cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data?.enabled, false);
    assert.equal(res.body.data?.config_enabled, false);
    assert.equal(res.body.data?.sc_status?.enabled, false);
  });

  it('blocks enabling soucannabis_orders without pagarme', async () => {
    await request(app)
      .patch('/api/v1/admin/external-services/soucannabis_orders')
      .set('Cookie', cookie)
      .send({ enabled: false });
    await request(app)
      .patch('/api/v1/admin/external-services/pagarme')
      .set('Cookie', cookie)
      .send({ enabled: false });
    const res = await request(app)
      .patch('/api/v1/admin/external-services/soucannabis_orders')
      .set('Cookie', cookie)
      .send({ enabled: true });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(errCode(res), 'DEPENDENCY_PAGARME');
  });

  it('PAYMENT_LOCK when split mode and marking paid without skip', async () => {
    await query(`
      INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, description)
      VALUES
        ('modules', 'modules.pagarme.enabled', 'true', 'boolean', false, false, 't'),
        ('modules', 'modules.soucannabis_orders.enabled', 'true', 'boolean', false, false, 't'),
        ('modules', 'modules.pagarme.association_recipient_id', 'rp_a', 'string', false, false, 't'),
        ('modules', 'modules.pagarme.soucannabis_recipient_id', 'rp_s', 'string', false, false, 't')
      ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value;
    `);

    const orderIns = await query(
      `INSERT INTO orders (status, total, order_code, associate_name, items, date_created)
       VALUES ('Aguardando pagamento', 150, $1, 'Teste', '[]'::jsonb, NOW())
       RETURNING id`,
      [randomUUID()]
    );
    const orderId = orderIns.rows[0].id;

    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'Pagamento concluído' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(errCode(res), 'PAYMENT_LOCK');
  });

  it('PAYMENT_LOCK skip flags work only in NODE_ENV=test', async () => {
    const orderIns = await query(
      `INSERT INTO orders (status, total, order_code, associate_name, items, date_created)
       VALUES ('Aguardando pagamento', 150, $1, 'Teste', '[]'::jsonb, NOW())
       RETURNING id`,
      [randomUUID()]
    );
    const orderId = orderIns.rows[0].id;

    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Cookie', cookie)
      .send({ status: 'Pagamento concluído', skip_payment_lock: true, force_test_paid: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'Pagamento concluído');
  });

  it('webhook order.paid without auth is rejected even when webhook creds are empty', async () => {
    const res = await request(app)
      .post('/api/v1/modules/pagarme/webhook')
      .send({ type: 'order.paid', data: { code: randomUUID() } });
    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(errCode(res), 'UNAUTHORIZED');
    const details = res.body?.errors?.[0]?.details;
    assert.equal(details?.pass_match, undefined);
    assert.equal(details?.expected_user, undefined);
    assert.equal(details?.user_match, undefined);
  });

  it('GET /outbound/audit exporta registros com Bearer outbound', async (t) => {
    if (await skipIfMissingTable('soucannabis_orders_audit')) {
      t.skip('Tabela soucannabis_orders_audit ausente — migration pendente no PG de teste');
      return;
    }

    const sc = require('../../../src/services/soucannabis_orders');
    const creds = await sc.outbound.ensureOutboundCredentials();
    const tokenRes = await sc.outbound.issueOutboundToken({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    });

    await sc.auditLog.recordSafe({
      direction: 'inbound',
      source: 'outbound_patch',
      action: 'update',
      status: 'ok',
      order_code: 'audit-e2e-code',
      request_payload: { status: 'test' },
      changed_keys: ['status'],
    });

    const res = await request(app)
      .get('/api/v1/modules/soucannabis_orders/outbound/audit')
      .query({ order_code: 'audit-e2e-code', limit: 10 })
      .set('Authorization', `Bearer ${tokenRes.access_token}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data);
    assert.ok(typeof res.body.data.total === 'number');
    assert.ok(Array.isArray(res.body.data.items));
    assert.ok(res.body.data.items.some((r) => r.order_code === 'audit-e2e-code'));
  });
});
