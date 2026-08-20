'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { globalSearch, ENTITIES } = require('../../src/services/searchService');

test('ENTITIES includes reception and excludes unknown collections', () => {
  assert.ok(ENTITIES.has('users'));
  assert.ok(ENTITIES.has('orders'));
  assert.ok(ENTITIES.has('services'));
  assert.ok(ENTITIES.has('reception'));
  assert.ok(!ENTITIES.has('unknown'));
});

test('globalSearch requires entity and q', async () => {
  await assert.rejects(() => globalSearch({}), (err) => err.code === 'VALIDATION_ERROR');
  await assert.rejects(
    () => globalSearch({ q: 'ab', entity: 'unknown' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});
