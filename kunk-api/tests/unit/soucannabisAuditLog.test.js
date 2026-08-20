'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('soucannabis_orders auditLog', () => {
  it('orderSnapshot extrai só campos relevantes', () => {
    const { orderSnapshot } = require('../../src/services/soucannabis_orders/auditLog');
    const snap = orderSnapshot({
      id: 1,
      order_code: 'abc',
      status: 'Pago',
      tracking_code: 'X',
      password: 'secret',
      foo: 'bar',
    });
    assert.equal(snap.id, 1);
    assert.equal(snap.order_code, 'abc');
    assert.equal(snap.tracking_code, 'X');
    assert.equal(snap.password, undefined);
    assert.equal(snap.foo, undefined);
  });

  it('diffKeys detecta limpeza (null) e alterações', () => {
    const { diffKeys } = require('../../src/services/soucannabis_orders/auditLog');
    const changed = diffKeys(
      { tracking_code: 'OLD', status: 'A', total: 10 },
      { tracking_code: null, status: 'A', total: 12 }
    );
    assert.ok(changed.includes('tracking_code'));
    assert.ok(changed.includes('total'));
    assert.ok(!changed.includes('status'));
  });

  it('sanitizePayload redige secrets', () => {
    const { sanitizePayload } = require('../../src/services/soucannabis_orders/auditLog');
    const out = sanitizePayload({
      client_id: 'id',
      client_secret: 'sekrit',
      nested: { access_token: 'tok', ok: 1 },
    });
    assert.equal(out.client_id, 'id');
    assert.equal(out.client_secret, '[redacted]');
    assert.equal(out.nested.access_token, '[redacted]');
    assert.equal(out.nested.ok, 1);
  });

  it('recordSafe não propaga erro de validação', async () => {
    const { recordSafe } = require('../../src/services/soucannabis_orders/auditLog');
    const result = await recordSafe({});
    assert.equal(result, null);
  });
});
