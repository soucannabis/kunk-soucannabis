'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAdmin } = require('../../src/middleware/authorize');

function invoke(req) {
  return new Promise((resolve) => {
    authorizeAdmin(req, {}, (err) => resolve(err || null));
  });
}

describe('authorizeAdmin', () => {
  it('passes session Administrador', async () => {
    const err = await invoke({ user: { roles: ['Administrador'] } });
    assert.equal(err, null);
  });

  it('rejects session Acolhimento', async () => {
    const err = await invoke({ user: { roles: ['Acolhimento'] } });
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('rejects session role api (reserved for tokens)', async () => {
    const err = await invoke({ user: { roles: ['api'] } });
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('passes API key with scope *', async () => {
    const err = await invoke({
      user: { roles: ['api'] },
      auth: { type: 'api_key', scopes: ['*'] },
    });
    assert.equal(err, null);
  });

  it('rejects limited API key even with roles api', async () => {
    const err = await invoke({
      user: { roles: ['api'] },
      auth: { type: 'api_key', scopes: ['items:tags:read'] },
    });
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('rejects missing user', async () => {
    const err = await invoke({});
    assert.equal(err.status, 401);
    assert.equal(err.code, 'UNAUTHORIZED');
  });
});
