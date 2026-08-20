'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('soucannabis_orders webhookSync', () => {
  it('normalizeSyncItems aceita order, orders[] ou objeto plano', () => {
    const { normalizeSyncItems } = require('../../src/services/soucannabis_orders/webhookSync');
    assert.equal(normalizeSyncItems({ orders: [{ id: 1 }, { id: 2 }] }).length, 2);
    assert.equal(normalizeSyncItems({ order: { external_id: 'a' } }).length, 1);
    assert.equal(normalizeSyncItems({ external_id: 'x', status: 'Aguardando aprovação' }).length, 1);
    assert.equal(normalizeSyncItems({ client_id: 'x' }).length, 0);
  });

  it('resolveRemoteId preferencia soucannabis_order_id e id numérico', () => {
    const { resolveRemoteId } = require('../../src/services/soucannabis_orders/webhookSync');
    assert.equal(resolveRemoteId({ soucannabis_order_id: '99', id: 1 }), '99');
    assert.equal(resolveRemoteId({ id: 47368, external_id: 'uuid' }), '47368');
    assert.equal(resolveRemoteId({ id: 'not-a-number' }), null);
  });

  it('webhookPaths expõe token e orders_sync', () => {
    const { webhookPaths } = require('../../src/services/soucannabis_orders/webhookSync');
    const p = webhookPaths();
    assert.match(p.token, /\/webhooks\/auth\/token$/);
    assert.match(p.orders_sync, /\/webhooks\/orders\/sync$/);
  });
});
