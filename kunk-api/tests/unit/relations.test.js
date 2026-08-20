'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRelation, listIncludeKeys, RELATIONS } = require('../../src/schema/relations');

describe('relations', () => {
  it('lists include keys per collection', () => {
    assert.deepEqual(listIncludeKeys('services').sort(), ['associate', 'professional']);
    assert.deepEqual(listIncludeKeys('users'), ['responsible']);
    assert.deepEqual(listIncludeKeys('orders'), []);
  });

  it('resolves FK-by-code mappings', () => {
    const pro = getRelation('services', 'professional');
    assert.equal(pro.localField, 'professional_id');
    assert.equal(pro.targetCollection, 'professionals');
    assert.equal(pro.targetKey, 'professional_code');
    assert.equal(pro.embedAs, 'professional');

    const assoc = getRelation('services', 'associate');
    assert.equal(assoc.localField, 'associate_user_code');
    assert.equal(assoc.targetKey, 'user_code');

    const resp = getRelation('users', 'responsible');
    assert.equal(resp.localField, 'responsible_code');
    assert.equal(resp.targetCollection, 'users');
  });

  it('returns null for unknown keys', () => {
    assert.equal(getRelation('services', 'nope'), null);
    assert.equal(RELATIONS.unknown, undefined);
  });
});
