'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isBcryptHash, hashPassword, verifyPassword } = require('../../src/utils/password');

describe('password utils', () => {
  it('isBcryptHash accepts hashes from hashPassword and rejects plaintext', async () => {
    const hash = await hashPassword('Secret123!');
    assert.equal(isBcryptHash(hash), true);
    assert.equal(isBcryptHash('Secret123!'), false);
    assert.equal(isBcryptHash('$2'), false);
    assert.equal(isBcryptHash('$2b$10$short'), false);
    assert.equal(isBcryptHash(null), false);
    assert.equal(isBcryptHash(''), false);
  });

  it('verifyPassword succeeds only for the matching bcrypt hash', async () => {
    const hash = await hashPassword('Secret123!');
    assert.equal(await verifyPassword('Secret123!', hash), true);
    assert.equal(await verifyPassword('wrong', hash), false);
  });

  it('verifyPassword rejects stored plaintext even when it equals the candidate', async () => {
    assert.equal(await verifyPassword('leftover-plain', 'leftover-plain'), false);
    assert.equal(await verifyPassword('leftover-plain', '$2b$04$notavalidbcrypthashvaluexxxxxxxxxxxx'), false);
    assert.equal(await verifyPassword('any', undefined), false);
    assert.equal(await verifyPassword('any', null), false);
  });
});
