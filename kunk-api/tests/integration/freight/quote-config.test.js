'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { readModuleFlag, setModuleFlags } = require('../../helpers/integrationEnv');
const storeFreight = require('../../../src/services/storeFreightConfig');

describe('freight/quote-config', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  it('returns FREIGHT_NO_QUOTE when no providers enabled', async () => {
    const snapshot = {
      loggi: await readModuleFlag('loggi'),
      melhorenvio: await readModuleFlag('melhorenvio'),
      soucannabis_orders: await readModuleFlag('soucannabis_orders'),
    };
    await setModuleFlags({ loggi: false, melhorenvio: false, soucannabis_orders: false });
    try {
      const res = await request(app)
        .post('/api/v1/freight/quote')
        .set('Cookie', cookie)
        .send({ address: { cep: '74000000', street: 'Rua', number: '1', city: 'Goiânia', state: 'GO' } });
      assert.equal(res.status, 400);
      assert.equal(res.body.errors[0].code, 'FREIGHT_NO_QUOTE');
    } finally {
      await setModuleFlags({
        loggi: snapshot.loggi === 'true',
        melhorenvio: snapshot.melhorenvio === 'true',
        soucannabis_orders: snapshot.soucannabis_orders === 'true',
      });
    }
  });

  it('CONFIG_INCOMPLETE when module on but store package missing', async () => {
    const snapshot = {
      soucannabis_orders: await readModuleFlag('soucannabis_orders'),
    };
    await setModuleFlags({ soucannabis_orders: false });

    const enable = await request(app)
      .patch('/api/v1/admin/external-services/loggi')
      .set('Cookie', cookie)
      .send({ enabled: true, use_for_quote: true });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));

    const original = storeFreight.getStoreFreightConfig;
    storeFreight.getStoreFreightConfig = async () => ({
      apply_to_total: true,
      ship_from: null,
      package: null,
      content_declaration: null,
      default_option: null,
      loggi_external_service_ids: null,
      melhorenvio_enabled_service_ids: null,
    });
    try {
      const res = await request(app)
        .post('/api/v1/freight/quote')
        .set('Cookie', cookie)
        .send({
          address: {
            cep: '74000000',
            street: 'Rua',
            number: '1',
            city: 'Goiânia',
            state: 'GO',
          },
        });
      assert.equal(res.status, 400);
      assert.equal(res.body.errors[0].code, 'CONFIG_INCOMPLETE');
    } finally {
      storeFreight.getStoreFreightConfig = original;
      await request(app)
        .patch('/api/v1/admin/external-services/loggi')
        .set('Cookie', cookie)
        .send({ enabled: false, use_for_quote: false });
      await setModuleFlags({
        soucannabis_orders: snapshot.soucannabis_orders === 'true',
      });
    }
  });
});
