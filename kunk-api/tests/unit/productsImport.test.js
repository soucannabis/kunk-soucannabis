'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const productsService = require('../../src/services/productsService');

describe('productsService CSV import helpers', () => {
  it('parses CSV with comma delimiter and headers', () => {
    const rows = productsService.parseCsvText(
      'sku,name,type,unit,concentration,price,amount,category,batch,status\n' +
        'ABC-1,Produto A,oil,ml,100,10.5,5,wellness,LOT1,published\n'
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sku, 'ABC-1');
    assert.equal(rows[0].price, '10.5');
    assert.equal(rows[0].__line, 2);
  });

  it('normalizes valid row and rejects invalid amount/status', () => {
    const ok = productsService.normalizeImportRow({
      __line: 2,
      sku: 'X-1',
      name: 'Item',
      price: '12,50',
      amount: '3',
      status: 'published',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.payload.price, 12.5);
    assert.equal(ok.payload.amount, 3);

    const bad = productsService.normalizeImportRow({
      __line: 3,
      sku: '',
      name: 'Sem sku',
      price: 'x',
      amount: '-1',
      status: 'nope',
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /sku/i.test(e)));
    assert.ok(bad.errors.some((e) => /price/i.test(e)));
    assert.ok(bad.errors.some((e) => /amount/i.test(e)));
    assert.ok(bad.errors.some((e) => /status/i.test(e)));
  });
});
