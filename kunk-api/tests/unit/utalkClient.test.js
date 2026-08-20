'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const utalkClient = require('../../src/services/utalk/client');

describe('utalk client', () => {
  it('testConnection exige api_token', async () => {
    await assert.rejects(
      () => utalkClient.testConnection({ api_token: '', organization_id: 'org' }),
      (err) => err.code === 'CREDENTIAL_MISSING' && /api_token/.test(err.message)
    );
  });

  it('testConnection exige organization_id', async () => {
    await assert.rejects(
      () => utalkClient.testConnection({ api_token: 'tok', organization_id: '' }),
      (err) => err.code === 'CREDENTIAL_MISSING' && /organization_id/.test(err.message)
    );
  });

  it('testConnection exige from_phone com DDI 55', async () => {
    await assert.rejects(
      () =>
        utalkClient.testConnection({
          api_token: 'tok',
          organization_id: 'org',
          from_phone: '62999999999',
        }),
      (err) => err.code === 'VALIDATION_ERROR' && /DDI|país|inválido/i.test(err.message)
    );
  });
});
