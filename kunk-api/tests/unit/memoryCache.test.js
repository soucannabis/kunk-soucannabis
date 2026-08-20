'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const memoryCache = require('../../src/cache/memoryCache');
const { getOrSet, clearAll } = require('../../src/cache');

describe('memoryCache', () => {
  it('stores and returns values with TTL', async () => {
    clearAll();
    memoryCache.set('a', 1, 60_000);
    assert.equal(memoryCache.get('a'), 1);
    memoryCache.invalidate('a');
    assert.equal(memoryCache.get('a'), undefined);
  });

  it('expires entries', async () => {
    clearAll();
    memoryCache.set('b', 2, 1);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(memoryCache.get('b'), undefined);
  });

  it('invalidatePrefix removes matching keys', () => {
    clearAll();
    memoryCache.set('tags:all', []);
    memoryCache.set('tags:ctx:orders', []);
    memoryCache.set('other', 1);
    memoryCache.invalidatePrefix('tags:');
    assert.equal(memoryCache.get('tags:all'), undefined);
    assert.equal(memoryCache.get('other'), 1);
  });
});
