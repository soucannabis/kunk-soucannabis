'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { OPERATORS, buildFilterSql, parseFilterQuery } = require('../../src/query/parseFilter');
const { AppError } = require('../../src/utils/response');

describe('parseFilter', () => {
  it('exposes all v1 operators', () => {
    for (const op of [
      '_eq', '_neq', '_in', '_nin', '_null', '_nnull',
      '_lt', '_lte', '_gt', '_gte',
      '_contains', '_icontains', '_starts_with', '_istarts_with',
      '_between', '_and', '_or',
    ]) {
      assert.ok(OPERATORS.has(op), op);
    }
  });

  it('builds _eq', () => {
    const { sql, params } = buildFilterSql('tags', { tag: { _eq: 'x' } });
    assert.match(sql, /tag = \$1/);
    assert.deepEqual(params, ['x']);
  });

  it('builds _icontains', () => {
    const { sql, params } = buildFilterSql('users', { associate_name: { _icontains: 'silva' } });
    assert.match(sql, /ILIKE/);
    assert.equal(params[0], '%silva%');
  });

  it('builds _and / _or', () => {
    const { sql, params } = buildFilterSql('orders', {
      _and: [{ status: { _eq: 'a' } }, { prescriber_code: { _eq: 'b' } }],
    });
    assert.match(sql, /AND/);
    assert.deepEqual(params, ['a', 'b']);
  });

  it('builds _in and _between', () => {
    const a = buildFilterSql('orders', { status: { _in: ['x', 'y'] } });
    assert.match(a.sql, /IN/);
    const b = buildFilterSql('orders', { total: { _between: [1, 10] } });
    assert.match(b.sql, /BETWEEN/);
  });

  it('rejects unknown field', () => {
    assert.throws(() => buildFilterSql('tags', { nope: { _eq: 1 } }), AppError);
  });

  it('rejects unknown operator', () => {
    assert.throws(() => buildFilterSql('tags', { tag: { _magic: 1 } }), AppError);
  });

  it('parses JSON filter string', () => {
    const f = parseFilterQuery('{"tag":{"_eq":"a"}}');
    assert.equal(f.tag._eq, 'a');
  });
});
