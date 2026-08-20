'use strict';

const bcrypt = require('bcrypt');

const SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 10;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Dummy hash so leftover/plaintext rows pay bcrypt cost instead of a fast reject. */
const DUMMY_HASH = bcrypt.hashSync('kunk-dummy-not-a-real-password', SALT_ROUNDS);

function isBcryptHash(value) {
  return typeof value === 'string' && value.length >= 60 && BCRYPT_HASH_RE.test(value);
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), SALT_ROUNDS);
}

/**
 * Compare a candidate password to a stored value.
 * Non-bcrypt leftovers always fail after a dummy compare (no plaintext equality).
 */
async function verifyPassword(plain, stored) {
  const candidate = String(plain ?? '');
  if (!isBcryptHash(stored)) {
    await bcrypt.compare(candidate, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(candidate, stored);
}

module.exports = {
  SALT_ROUNDS,
  isBcryptHash,
  hashPassword,
  verifyPassword,
};
