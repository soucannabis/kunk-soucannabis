'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFields } = require('../../src/query/parseFields');

describe('parseFields', () => {
  it('excludes sensitive by default', () => {
    const fields = parseFields('system_users', '*');
    assert.ok(!fields.includes('password'));
    assert.ok(!fields.includes('session_token'));
    assert.ok(fields.includes('email'));
  });

  it('respects allowlist', () => {
    const fields = parseFields('tags', 'id,tag');
    assert.deepEqual(fields, ['id', 'tag']);
  });

  it('strips sensitive even if requested', () => {
    const fields = parseFields('users', 'id,account_password,email_account');
    assert.ok(!fields.includes('account_password'));
    assert.ok(fields.includes('email_account'));
  });
});
