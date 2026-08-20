'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { signPayload, verifySignature, buildHeaders } = require('../../src/services/webhooks/sign');
const { sanitizeRecord } = require('../../src/services/webhooks/sanitize');
const { computeNextAttemptAt, assertHttpUrl, normalizeTables, normalizeActions } = require('../../src/services/webhooks/repository');
const { isWebhookTable, isWebhookAction } = require('../../src/services/webhooks/catalog');
const { AppError } = require('../../src/utils/response');

describe('webhooks unit', () => {
  it('catalog recognizes v1 tables and actions', () => {
    assert.equal(isWebhookTable('orders'), true);
    assert.equal(isWebhookTable('products'), false);
    assert.equal(isWebhookAction('create'), true);
    assert.equal(isWebhookAction('ping'), false);
  });

  it('HMAC sign/verify roundtrip', () => {
    const secret = 'whsec_test';
    const body = '{"ok":true}';
    const ts = '1710000000';
    const sig = signPayload(secret, body, ts);
    assert.match(sig, /^sha256=[a-f0-9]{64}$/);
    assert.equal(verifySignature(secret, body, ts, sig), true);
    assert.equal(verifySignature(secret, body, ts, 'sha256=deadbeef'), false);
  });

  it('buildHeaders includes signature and event metadata', () => {
    const body = '{"a":1}';
    const headers = buildHeaders({
      eventId: 'evt',
      deliveryId: 9,
      table: 'orders',
      action: 'update',
      secret: 's',
      body,
      timestamp: 123,
    });
    assert.equal(headers['X-Kunk-Event'], 'evt');
    assert.equal(headers['X-Kunk-Delivery'], '9');
    assert.equal(headers['X-Kunk-Table'], 'orders');
    assert.equal(headers['X-Kunk-Action'], 'update');
    assert.equal(headers['X-Kunk-Timestamp'], '123');
    assert.ok(headers['X-Kunk-Signature'].startsWith('sha256='));
  });

  it('sanitize strips sensitive user fields', () => {
    const out = sanitizeRecord('users', {
      id: 1,
      name: 'A',
      account_password: 'x',
      session_token: 'y',
      password_reset_token: 'z',
    });
    assert.equal(out.id, 1);
    assert.equal(out.name, 'A');
    assert.equal(out.account_password, undefined);
    assert.equal(out.session_token, undefined);
    assert.equal(out.password_reset_token, undefined);
  });

  it('computeNextAttemptAt uses exponential backoff', () => {
    const a0 = computeNextAttemptAt(0).getTime();
    const a3 = computeNextAttemptAt(3).getTime();
    const now = Date.now();
    assert.ok(a0 >= now + 14_000);
    assert.ok(a3 > a0);
  });

  it('assertHttpUrl rejects non-http', () => {
    assert.throws(() => assertHttpUrl('ftp://x'), (err) => err instanceof AppError);
    assert.equal(assertHttpUrl('https://example.com/hook'), 'https://example.com/hook');
  });

  it('normalizeTables/actions validate allow-list', () => {
    assert.deepEqual(normalizeTables(['users', 'orders']), ['users', 'orders']);
    assert.throws(() => normalizeTables(['products']), (err) => err instanceof AppError);
    assert.deepEqual(normalizeActions(['create', 'delete']), ['create', 'delete']);
    assert.throws(() => normalizeActions([]), (err) => err instanceof AppError);
  });

  it('diffChangedFields returns only altered fields plus pk', () => {
    const { diffChangedFields, hasMeaningfulChanges } = require('../../src/services/webhooks/diff');
    const before = { id: 1, name: 'Ana', phone: '11', city: 'SP' };
    const after = { id: 1, name: 'Ana', phone: '22', city: 'SP', date_updated: '2026-01-01' };
    const changed = diffChangedFields(before, after, { alwaysInclude: ['id'] });
    assert.deepEqual(changed, { id: 1, phone: '22', date_updated: '2026-01-01' });
    assert.equal(hasMeaningfulChanges(changed, ['id']), true);
    assert.equal(hasMeaningfulChanges({ id: 1 }, ['id']), false);
  });
});
