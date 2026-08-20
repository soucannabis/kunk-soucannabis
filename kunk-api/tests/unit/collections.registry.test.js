'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TARGET_TABLES, getCollection } = require('../../src/schema/collections');

const NON_ITEMS_TABLES = new Set([
  'system_configs',
  'system_activity',
  'system_api_credentials',
  'system_errors',
  'system_error_resolutions',
  'web_vitals',
  'product_stock_movements',
  'operator_sessions',
  'term_templates',
  'term_template_versions',
  'term_contracts',
  'term_signatures',
  'term_events',
  'webhook_endpoints',
  'webhook_deliveries',
]);

describe('collections.registry', () => {
  it('TARGET_TABLES matches items tables from target-schema.sql', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../sql/target-schema.sql'),
      'utf8'
    );
    const fromSql = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    const fromSqlItems = fromSql.filter((t) => !NON_ITEMS_TABLES.has(t));
    assert.equal(TARGET_TABLES.length, fromSqlItems.length);
    assert.deepEqual([...TARGET_TABLES].sort(), [...fromSqlItems].sort());
  });

  it('every collection has columns and pk', () => {
    for (const name of TARGET_TABLES) {
      const c = getCollection(name);
      assert.ok(c, name);
      assert.ok(c.columns.length > 0, name);
      assert.ok(c.pk.name);
    }
  });
});
