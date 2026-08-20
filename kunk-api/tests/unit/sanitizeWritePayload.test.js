'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeWritePayload } = require('../../src/repositories/itemsRepository');
const { AppError } = require('../../src/utils/response');

describe('sanitizeWritePayload', () => {
  it('keeps known columns', () => {
    const out = sanitizeWritePayload('orders', { status: 'Novo', total: 10 });
    assert.equal(out.status, 'Novo');
    assert.equal(out.total, 10);
  });

  it('rejects removed / unknown fields', () => {
    assert.throws(
      () =>
        sanitizeWritePayload('orders', {
          status: 'Novo',
          delivery_problem: { x: 1 },
          legacy_affiliate: 'P1',
          melhorenvio_order_id: 'ME-1',
        }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.deepEqual(err.details.unknown_fields.sort(), [
          'delivery_problem',
          'legacy_affiliate',
          'melhorenvio_order_id',
        ]);
        return true;
      }
    );
  });

  it('rejects legacy user fields', () => {
    assert.throws(
      () =>
        sanitizeWritePayload('users', {
          associate_name: 'A',
          pipefy_card_id: '1',
          medical_prescription: 'x.pdf',
          form_error_log: '[]',
        }),
      (err) => {
        assert.deepEqual(err.details.unknown_fields.sort(), [
          'form_error_log',
          'medical_prescription',
          'pipefy_card_id',
        ]);
        return true;
      }
    );
  });

  it('accepts renamed users fields prescription and invalid_fields on create', () => {
    const out = sanitizeWritePayload(
      'users',
      {
        associate_name: 'A',
        prescription: 'rx.pdf',
        invalid_fields: '["cep"]',
      },
      { isCreate: true }
    );
    assert.equal(out.prescription, 'rx.pdf');
    assert.equal(out.invalid_fields, '["cep"]');
  });

  it('drops funnel and identity fields on users update, keeps them on create', () => {
    const created = sanitizeWritePayload(
      'users',
      {
        associate_name: 'A',
        user_code: 'u-1',
        status: 'cadastro_criado',
        associate_status: 'dados_pessoais',
        invalid_fields: '["cep"]',
      },
      { isCreate: true }
    );
    assert.equal(created.user_code, 'u-1');
    assert.equal(created.status, 'cadastro_criado');
    assert.equal(created.associate_status, 'dados_pessoais');
    assert.equal(created.invalid_fields, '["cep"]');

    const patched = sanitizeWritePayload(
      'users',
      {
        associate_name: 'B',
        user_code: 'stolen',
        status: 'Associado',
        associate_status: 'concluido',
        invalid_fields: '["cep"]',
        prescription: 'rx.pdf',
      },
      { isCreate: false }
    );
    assert.equal(patched.associate_name, 'B');
    assert.equal(patched.prescription, 'rx.pdf');
    assert.equal(patched.user_code, undefined);
    assert.equal(patched.status, undefined);
    assert.equal(patched.associate_status, undefined);
    assert.equal(patched.invalid_fields, undefined);
  });

  it('skipReadonly allows dedicated funnel writes on update', () => {
    const out = sanitizeWritePayload(
      'users',
      { status: 'Associado', associate_status: 'assinatura_termo', user_code: 'nope' },
      { isCreate: false, skipReadonly: ['status', 'associate_status'] }
    );
    assert.equal(out.status, 'Associado');
    assert.equal(out.associate_status, 'assinatura_termo');
    assert.equal(out.user_code, undefined);
  });

  it('skips undefined values without treating as unknown', () => {
    const out = sanitizeWritePayload('orders', { status: 'Novo', total: undefined });
    assert.equal(out.status, 'Novo');
    assert.equal(out.total, undefined);
  });

  it('drops storage location fields on files writes', () => {
    const created = sanitizeWritePayload(
      'files',
      {
        filename: 'a.txt',
        mime_type: 'text/plain',
        storage_path: '/etc/passwd',
        storage_key: '/etc/passwd',
        storage_driver: 'local',
      },
      { isCreate: true }
    );
    assert.equal(created.filename, 'a.txt');
    assert.equal(created.mime_type, 'text/plain');
    assert.equal(created.storage_path, undefined);
    assert.equal(created.storage_key, undefined);
    assert.equal(created.storage_driver, undefined);

    const patched = sanitizeWritePayload(
      'files',
      { storage_key: '../.env', filename: 'b.txt' },
      { isCreate: false }
    );
    assert.equal(patched.filename, 'b.txt');
    assert.equal(patched.storage_key, undefined);
  });

  it('drops password, account_password and token from writes', () => {
    const users = sanitizeWritePayload('users', {
      associate_name: 'A',
      account_password: 'plain',
    });
    assert.equal(users.associate_name, 'A');
    assert.equal(users.account_password, undefined);

    const operators = sanitizeWritePayload('system_users', {
      name: 'Op',
      password: 'plain',
    });
    assert.equal(operators.name, 'Op');
    assert.equal(operators.password, undefined);

    const tokens = sanitizeWritePayload('users_api', {
      email: 'tok@t.com',
      token: 'plain',
    });
    assert.equal(tokens.email, 'tok@t.com');
    assert.equal(tokens.token, undefined);
  });

  it('drops session fields on users create and update', () => {
    const created = sanitizeWritePayload(
      'users',
      { associate_name: 'A', session_expires: '2099-01-01', is_session_active: true },
      { isCreate: true }
    );
    assert.equal(created.associate_name, 'A');
    assert.equal(created.session_expires, undefined);
    assert.equal(created.is_session_active, undefined);
  });
});
