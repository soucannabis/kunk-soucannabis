'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertOperatorPermissions } = require('../../src/services/systemUsersService');

describe('assertOperatorPermissions', () => {
  it('rejects Prescritor as a login role', async () => {
    await assert.rejects(
      () => assertOperatorPermissions(['Prescritor'], 'code-1'),
      (err) => err.status === 400 && err.code === 'VALIDATION_ERROR'
    );
  });

  it('rejects Profissional mixed with staff', async () => {
    await assert.rejects(
      () => assertOperatorPermissions(['Profissional', 'Acolhimento'], 'code-1'),
      (err) => err.status === 400 && /não pode ser combinada/i.test(err.message)
    );
  });

  it('rejects Profissional without internal_code', async () => {
    await assert.rejects(
      () => assertOperatorPermissions(['Profissional'], ''),
      (err) => err.status === 400 && /profissional/i.test(err.message)
    );
  });

  it('allows staff without internal_code', async () => {
    await assertOperatorPermissions(['Acolhimento'], null);
  });
});
