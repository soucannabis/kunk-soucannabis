'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCorsOrigin } = require('../../src/config/env');

describe('parseCorsOrigin', () => {
  it('rejects empty values instead of reflecting any Origin', () => {
    assert.equal(parseCorsOrigin(undefined), false);
    assert.equal(parseCorsOrigin(null), false);
    assert.equal(parseCorsOrigin(''), false);
    assert.equal(parseCorsOrigin('   '), false);
    assert.equal(parseCorsOrigin(',,'), false);
  });

  it('rejects boolean/string true (legacy reflect-all)', () => {
    assert.equal(parseCorsOrigin(true), false);
    assert.equal(parseCorsOrigin('true'), false);
    assert.equal(parseCorsOrigin('TRUE'), false);
  });

  it('returns a single origin string', () => {
    assert.equal(parseCorsOrigin('https://admin.example.org'), 'https://admin.example.org');
  });

  it('returns an array for a CSV allowlist', () => {
    assert.deepEqual(parseCorsOrigin('https://a.example, https://b.example'), [
      'https://a.example',
      'https://b.example',
    ]);
  });
});
