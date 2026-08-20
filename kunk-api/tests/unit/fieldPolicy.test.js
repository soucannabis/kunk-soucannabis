'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { stripSensitive, SENSITIVE_FIELDS } = require('../../src/schema/collections');

describe('fieldPolicy', () => {
  it('strips all documented sensitive fields', () => {
    for (const [collection, fields] of Object.entries(SENSITIVE_FIELDS)) {
      const row = { id: 1 };
      for (const f of fields) row[f] = 'secret';
      const clean = stripSensitive(collection, row);
      for (const f of fields) {
        assert.equal(clean[f], undefined, `${collection}.${f}`);
      }
      assert.equal(clean.id, 1);
    }
  });
});
