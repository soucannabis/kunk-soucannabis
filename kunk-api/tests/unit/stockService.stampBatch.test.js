'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const stockService = require('../../src/services/stockService');

function mockClient(productsById, productsBySku) {
  return {
    async query(sql, params) {
      if (/WHERE id = \$1/.test(sql)) {
        const row = productsById.get(Number(params[0])) || null;
        return { rows: row ? [row] : [] };
      }
      if (/WHERE sku = \$1/.test(sql)) {
        const row = productsBySku.get(String(params[0])) || null;
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
  };
}

describe('stockService.stampItemsBatch', () => {
  it('stamps products.batch onto order items missing batch', async () => {
    const byId = new Map([
      [10, { id: 10, batch: 'LOT-A' }],
      [20, { id: 20, batch: 'LOT-B' }],
    ]);
    const client = mockClient(byId, new Map());
    const { items, changed } = await stockService.stampItemsBatch(client, [
      { product_id: 10, code: 'SKU-A', quantity: 1 },
      { product_id: 20, code: 'SKU-B', quantity: 2, batch: '' },
    ]);
    assert.equal(changed, true);
    assert.equal(items[0].batch, 'LOT-A');
    assert.equal(items[1].batch, 'LOT-B');
  });

  it('keeps existing item batch when product has no batch', async () => {
    const byId = new Map([[11, { id: 11, batch: null }]]);
    const client = mockClient(byId, new Map());
    const { items, changed } = await stockService.stampItemsBatch(client, [
      { product_id: 11, code: 'X', quantity: 1, batch: 'KEEP-ME' },
    ]);
    assert.equal(changed, false);
    assert.equal(items[0].batch, 'KEEP-ME');
  });

  it('resolves product by sku when product_id is missing', async () => {
    const bySku = new Map([['ABC', { id: 99, batch: 'LOT-SKU' }]]);
    const client = mockClient(new Map(), bySku);
    const { items, changed } = await stockService.stampItemsBatch(client, [
      { code: 'ABC', quantity: 1 },
    ]);
    assert.equal(changed, true);
    assert.equal(items[0].batch, 'LOT-SKU');
    assert.equal(items[0].product_id, 99);
  });
});
