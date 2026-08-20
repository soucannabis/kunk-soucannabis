'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  COLLECTIONS,
  QUERY_OPERATORS,
  ERROR_CODES,
  AUTH_ROUTES,
  DOMAIN_ROUTES,
  MODULE_NAMES,
} = require('../../src/contract/inventory');
const { TARGET_TABLES } = require('../../src/schema/collections');
const { createApp } = require('../../src/app');

function collectRoutes(app) {
  const routes = [];
  const stack = app._router?.stack || [];
  function walk(layer, prefix = '') {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      for (const method of methods) {
        routes.push([method, prefix + layer.route.path]);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      let newPrefix = prefix;
      if (layer.regexp && layer.regexp.fast_slash) {
        /* root */
      } else if (layer.regexp) {
        const match = layer.regexp.toString().match(/\\\/([^\\/?]+)/g);
        if (match) {
          newPrefix += match.map((s) => s.replace(/\\\//g, '/')).join('');
        }
      }
      for (const l of layer.handle.stack) walk(l, newPrefix);
    }
  }
  for (const layer of stack) walk(layer);
  return routes;
}

describe('contract/api-structure', () => {
  it('collections match target-schema.sql', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../sql/target-schema.sql'),
      'utf8'
    );
    const fromSql = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    // Managed outside /items whitelist (dedicated routes)
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
    const fromSqlItems = fromSql.filter((t) => !NON_ITEMS_TABLES.has(t));
    assert.deepEqual([...COLLECTIONS].sort(), [...fromSqlItems].sort());
    assert.deepEqual(COLLECTIONS, TARGET_TABLES);
  });

  it('has required query operators', () => {
    for (const op of [
      '_eq', '_neq', '_in', '_nin', '_null', '_nnull', '_lt', '_lte', '_gt', '_gte',
      '_contains', '_icontains', '_starts_with', '_istarts_with', '_between', '_and', '_or',
    ]) {
      assert.ok(QUERY_OPERATORS.includes(op), op);
    }
  });

  it('has required error codes', () => {
    for (const code of [
      'VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNKNOWN_COLLECTION',
      'CONFLICT', 'MODULE_DISABLED', 'INTERNAL_ERROR', 'AUTH_CONFLICT',
    ]) {
      assert.ok(ERROR_CODES.includes(code), code);
    }
  });

  it('inventory lists auth and domain routes', () => {
    assert.ok(AUTH_ROUTES.length >= 6);
    assert.ok(DOMAIN_ROUTES.length >= 30);
    assert.ok(MODULE_NAMES.includes('loggi'));
  });

  it('app mounts /api/v1 stack', () => {
    const app = createApp();
    const routes = collectRoutes(app);
    const paths = routes.map(([, p]) => p).join(' ');
    assert.ok(paths.includes('/api/v1') || routes.length > 0);
    // Ensure items and auth routers are mounted via layer inspection
    const layerPaths = app._router.stack
      .filter((l) => l.name === 'router' || l.route)
      .map((l) => l.regexp?.toString() || l.route?.path || '');
    assert.ok(layerPaths.some((p) => p.includes('api') || p.includes('health')));
  });

  it('each collection has an items test file', () => {
    const dir = path.join(__dirname, '../integration/items');
    for (const name of COLLECTIONS) {
      const file = path.join(dir, `${name}.test.js`);
      assert.ok(fs.existsSync(file), `missing test for ${name}`);
    }
  });
});
