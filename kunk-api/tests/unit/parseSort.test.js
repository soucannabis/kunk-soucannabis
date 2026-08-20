'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseSort } = require('../../src/query/parseSort');
const { AppError } = require('../../src/utils/response');

describe('parseSort', () => {
  it('defaults to id DESC', () => {
    assert.equal(parseSort('tags'), 'id DESC');
  });

  it('parses ascending and descending', () => {
    assert.equal(parseSort('tags', 'tag,-id'), 'tag ASC, id DESC');
  });

  it('rejects unknown column', () => {
    assert.throws(() => parseSort('tags', 'nope'), AppError);
  });
});
