'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapPgError, errorHandler } = require('../../src/middleware/errorHandler');
const { AppError } = require('../../src/utils/response');

function captureJson(err) {
  let status;
  let body;
  const res = {
    headersSent: false,
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  errorHandler(err, { method: 'POST', path: '/t' }, res, () => {});
  return { status, body };
}

describe('mapPgError', () => {
  it('maps foreign_key_violation to VALIDATION_ERROR without pg detail', () => {
    const mapped = mapPgError({
      code: '23503',
      constraint: 'fk_services_professional_id',
      table: 'services',
      detail: 'Key (professional_id)=(secret) is not present in table "professionals".',
    });
    assert.ok(mapped instanceof AppError);
    assert.equal(mapped.status, 400);
    assert.equal(mapped.code, 'VALIDATION_ERROR');
    assert.equal(mapped.details, null);
    assert.equal(String(mapped.message).includes('secret'), false);
  });

  it('maps login email unique index to ACCOUNT_EXISTS without leaking the address', () => {
    const mapped = mapPgError({
      code: '23505',
      constraint: 'users_email_account_login_uidx',
      table: 'users',
      detail: 'Key (email_account)=(maria@example.com) already exists.',
    });
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, 'ACCOUNT_EXISTS');
    assert.equal(mapped.details, null);
    assert.equal(String(mapped.message).includes('maria@'), false);
  });

  it('maps unique_violation to CONFLICT without constraint or value', () => {
    const mapped = mapPgError({
      code: '23505',
      constraint: 'users_email_key',
      table: 'users',
      detail: 'Key (email)=(maria@example.com) already exists.',
    });
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, 'CONFLICT');
    assert.equal(mapped.details, null);
    assert.equal(mapped.message.includes('maria@'), false);
    assert.equal(mapped.message.includes('users_email_key'), false);
  });

  it('maps not_null without column name', () => {
    const mapped = mapPgError({ code: '23502', column: 'cpf' });
    assert.equal(mapped.status, 400);
    assert.equal(mapped.message.includes('cpf'), false);
  });

  it('maps invalid uuid format to VALIDATION_ERROR', () => {
    const mapped = mapPgError({ code: '22P02' });
    assert.equal(mapped.status, 400);
    assert.equal(mapped.code, 'VALIDATION_ERROR');
    assert.equal(mapped.details, null);
  });

  it('maps integer+phase string 22P02 to SCHEMA_MISMATCH', () => {
    const mapped = mapPgError({
      code: '22P02',
      message: 'invalid input syntax for type integer: "assinatura_termo"',
    });
    assert.equal(mapped.status, 500);
    assert.equal(mapped.code, 'SCHEMA_MISMATCH');
    assert.equal(mapped.details, null);
  });

  it('returns null for unknown codes', () => {
    assert.equal(mapPgError({ code: '42P01' }), null);
  });

  it('HTTP 409 does not serialize Postgres detail/table/constraint', () => {
    const { status, body } = captureJson({
      code: '23505',
      constraint: 'users_email_key',
      table: 'users',
      detail: 'Key (email)=(maria@example.com) already exists.',
    });
    assert.equal(status, 409);
    const dumped = JSON.stringify(body);
    assert.equal(dumped.includes('maria@'), false);
    assert.equal(dumped.includes('users_email_key'), false);
    assert.equal(dumped.includes('already exists'), false);
    assert.equal(body.errors[0].details, null);
  });
});
