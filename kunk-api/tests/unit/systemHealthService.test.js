'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { serviceCatalog } = require('../../src/services/systemHealthService');

describe('systemHealthService', () => {
  it('lists all stack services with health paths', () => {
    const catalog = serviceCatalog(null);
    const ids = catalog.map((s) => s.id);
    assert.deepEqual(ids, ['api', 'admin', 'kunk', 'registration', 'doc-sign']);
    assert.equal(catalog.find((s) => s.id === 'api').healthPath, '/api/v1/health');
    for (const svc of catalog.filter((s) => s.id !== 'api')) {
      assert.equal(svc.healthPath, '/health');
      assert.ok(svc.url);
    }
  });
});
