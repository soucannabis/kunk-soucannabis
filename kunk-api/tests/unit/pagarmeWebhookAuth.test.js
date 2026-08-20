'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const credentialsService = require('../../src/services/credentialsService');
const webhook = require('../../src/services/pagarme/webhook');

function reqWithBasic(user, pass) {
  const token = Buffer.from(`${user}:${pass}`).toString('base64');
  return { headers: { authorization: `Basic ${token}` } };
}

describe('pagarme webhook Basic Auth', () => {
  afterEach(() => mock.restoreAll());

  it('rejects when webhook user and password are empty', async () => {
    mock.method(credentialsService, 'resolveAll', async () => ({
      webhook_user: '',
      webhook_pass: '',
    }));
    assert.equal(await webhook.verifyBasicAuth({ headers: {} }), false);
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('anyone', 'x')), false);
  });

  it('rejects when only user or only password is set', async () => {
    mock.method(credentialsService, 'resolveAll', async () => ({
      webhook_user: 'hook',
      webhook_pass: '',
    }));
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('hook', '')), false);

    mock.restoreAll();
    mock.method(credentialsService, 'resolveAll', async () => ({
      webhook_user: '',
      webhook_pass: 'secret',
    }));
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('', 'secret')), false);
  });

  it('accepts matching credentials and rejects mismatches', async () => {
    mock.method(credentialsService, 'resolveAll', async () => ({
      webhook_user: 'hook_user',
      webhook_pass: 's3cret',
    }));
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('hook_user', 's3cret')), true);
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('hook_user', 'wrong')), false);
    assert.equal(await webhook.verifyBasicAuth(reqWithBasic('other', 's3cret')), false);
    assert.equal(await webhook.verifyBasicAuth({ headers: {} }), false);
  });

  it('basicAuthDebug does not leak user, password or match flags', async () => {
    mock.method(credentialsService, 'resolveAll', async () => ({
      webhook_user: 'hook_user',
      webhook_pass: 's3cret',
    }));
    const debug = await webhook.basicAuthDebug(reqWithBasic('hook_user', 'wrong'));
    assert.equal(debug.configured, true);
    assert.equal(debug.header_present, true);
    assert.equal(debug.header_is_basic, true);
    assert.equal(debug.pass_match, undefined);
    assert.equal(debug.expected_user, undefined);
    assert.equal(debug.received_user, undefined);
    assert.equal(debug.user_match, undefined);
  });
});
