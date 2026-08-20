'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sha256Hex } = require('../../src/utils/tokenHash');

describe('sha256Hex', () => {
  it('returns a stable 64-char hex digest', () => {
    const digest = sha256Hex('session-token');
    assert.equal(digest, sha256Hex('session-token'));
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, 'session-token');
    assert.notEqual(sha256Hex('a'), sha256Hex('b'));
  });
});
