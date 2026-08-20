'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseInclude, truthyParam } = require('../../src/services/includeService');
const { AppError } = require('../../src/utils/response');

describe('includeService', () => {
  describe('parseInclude', () => {
    it('returns empty for missing or blank', () => {
      assert.deepEqual(parseInclude('services', undefined), []);
      assert.deepEqual(parseInclude('services', null), []);
      assert.deepEqual(parseInclude('services', ''), []);
    });

    it('parses comma-separated keys and dedupes', () => {
      assert.deepEqual(parseInclude('services', 'professional,associate'), [
        'professional',
        'associate',
      ]);
      assert.deepEqual(parseInclude('services', 'professional, professional'), ['professional']);
    });

    it('accepts users.responsible', () => {
      assert.deepEqual(parseInclude('users', 'responsible'), ['responsible']);
    });

    it('rejects unknown include keys', () => {
      assert.throws(() => parseInclude('services', 'nope'), (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'VALIDATION_ERROR');
        return true;
      });
    });

    it('rejects include on collections without relations', () => {
      assert.throws(() => parseInclude('orders', 'anything'), AppError);
    });
  });

  describe('truthyParam', () => {
    it('treats presence and empty string as true', () => {
      assert.equal(truthyParam(''), true);
      assert.equal(truthyParam('1'), true);
      assert.equal(truthyParam('true'), true);
      assert.equal(truthyParam('yes'), true);
    });

    it('treats absent and explicit false as false', () => {
      assert.equal(truthyParam(undefined), false);
      assert.equal(truthyParam(null), false);
      assert.equal(truthyParam(false), false);
      assert.equal(truthyParam(0), false);
      assert.equal(truthyParam('false'), false);
      assert.equal(truthyParam('0'), false);
      assert.equal(truthyParam('no'), false);
    });
  });
});
