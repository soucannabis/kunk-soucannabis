'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildDataset } = require('../../sample-data/seed');

describe('sample dataset', () => {
  it('does not set associate password or API token', async () => {
    const dataset = await buildDataset({
      users: 2,
      institutional_clients: 0,
      professionals: 1,
      products: 1,
      tags: 1,
      orders: 0,
      services: 0,
      reception: 0,
      reports: 0,
      files: 1,
      users_files: 0,
      orders_files: 0,
      services_files: 0,
      users_api: 0,
    });
    assert.equal(dataset.users.length, 2);
    assert.equal(dataset.users[0].account_password, null);
    assert.equal(dataset.users[1].account_password, null);
    assert.equal(dataset.users[0].session_token, null);
    assert.deepEqual(dataset.users_api, []);
  });
});
