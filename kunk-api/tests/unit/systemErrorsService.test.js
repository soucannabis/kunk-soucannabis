'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('systemErrorsService helpers', () => {
  it('computeHash is stable for same inputs', () => {
    const { computeHash } = require('../../src/services/systemErrorsService');
    const a = computeHash({
      message: 'boom',
      file_name: '/app/x.js',
      lineno: 10,
      code: 'INTERNAL_ERROR',
      source: 'backend',
    });
    const b = computeHash({
      message: 'boom',
      file_name: '/app/x.js',
      lineno: 10,
      code: 'INTERNAL_ERROR',
      source: 'backend',
    });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('computeHash changes when message changes', () => {
    const { computeHash } = require('../../src/services/systemErrorsService');
    const a = computeHash({ message: 'a', source: 'frontend' });
    const b = computeHash({ message: 'b', source: 'frontend' });
    assert.notEqual(a, b);
  });

  it('sanitizeText strips email and cpf', () => {
    const { sanitizeText } = require('../../src/services/systemErrorsService');
    const out = sanitizeText('user a@b.com cpf 123.456.789-00', 200);
    assert.ok(out.includes('[email]'));
    assert.ok(out.includes('[cpf]'));
    assert.ok(!out.includes('a@b.com'));
  });

  it('parseStackFrame skips node_modules', () => {
    const { parseStackFrame } = require('../../src/services/systemErrorsService');
    const stack = `Error: x
    at Object.<anonymous> (/home/app/node_modules/foo/index.js:1:1)
    at run (/home/app/kunk-api/src/services/systemErrorsService.js:42:7)`;
    const parsed = parseStackFrame(stack);
    assert.ok(parsed.file_name.includes('systemErrorsService.js'));
    assert.equal(parsed.lineno, 42);
  });

  it('normalizePayload requires source and message', () => {
    const { normalizePayload } = require('../../src/services/systemErrorsService');
    assert.throws(() => normalizePayload({ message: 'x' }), /source/);
    assert.throws(() => normalizePayload({ source: 'frontend' }), /message/);
  });
});

describe('shouldRecordError', () => {
  it('skips AppError 4xx and records 5xx', () => {
    const { shouldRecordError } = require('../../src/middleware/errorHandler');
    const { AppError } = require('../../src/utils/response');
    assert.equal(shouldRecordError(new AppError(400, 'VALIDATION_ERROR', 'no')), false);
    assert.equal(shouldRecordError(new AppError(500, 'INTERNAL_ERROR', 'yes')), true);
    assert.equal(shouldRecordError(new Error('unexpected')), true);
  });

  it('skips mapped pg 4xx', () => {
    const { shouldRecordError } = require('../../src/middleware/errorHandler');
    assert.equal(shouldRecordError({ code: '23505', constraint: 'x' }), false);
  });
});

describe('recordSafe fail-soft', () => {
  it('returns null when payload is invalid', async () => {
    const svc = require('../../src/services/systemErrorsService');
    const result = await svc.recordSafe({});
    assert.equal(result, null);
  });
});
