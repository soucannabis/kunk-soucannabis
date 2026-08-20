'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePayload,
  normalizePath,
  parsePeriodMs,
  recordSafe,
} = require('../../src/services/webVitalsService');

describe('webVitalsService helpers', () => {
  it('normalizePath extracts pathname from URL', () => {
    assert.equal(normalizePath('https://app.example/app/recepcao?x=1'), '/app/recepcao');
    assert.equal(normalizePath('/loja/pedidos'), '/loja/pedidos');
  });

  it('normalizePayload accepts LCP', () => {
    const row = normalizePayload({
      name: 'lcp',
      value: 2500,
      rating: 'good',
      app: 'kunk',
      url: 'https://x.test/a',
    });
    assert.equal(row.name, 'LCP');
    assert.equal(row.value, 2500);
    assert.equal(row.path, '/a');
  });

  it('normalizePayload rejects invalid name', () => {
    assert.throws(() => normalizePayload({ name: 'FID', value: 1 }), /name/);
  });

  it('parsePeriodMs defaults and parses', () => {
    assert.equal(parsePeriodMs('24h'), 24 * 60 * 60 * 1000);
    assert.equal(parsePeriodMs('7d'), 7 * 24 * 60 * 60 * 1000);
  });

  it('recordSafe returns null on invalid payload', async () => {
    const result = await recordSafe({});
    assert.equal(result, null);
  });
});
