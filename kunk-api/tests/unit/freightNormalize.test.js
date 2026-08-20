'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loggiOption, melhorEnvioOption } = require('../../src/services/freightNormalize');

describe('freightNormalize', () => {
  it('normalizes Loggi option_key', () => {
    const o = loggiOption({
      freight_type: 'FREIGHT_TYPE_ECONOMIC',
      service_label: 'Loggi Econômico',
      price: 18.5,
      eta_days: 5,
    });
    assert.equal(o.option_key, 'loggi:FREIGHT_TYPE_ECONOMIC');
    assert.equal(o.provider, 'loggi');
    assert.equal(o.price, 18.5);
  });

  it('normalizes Melhor Envio option_key', () => {
    const o = melhorEnvioOption({
      company_id: 1,
      company_name: 'Correios',
      service_id: 1,
      service_name: 'PAC',
      price: 12.1,
      eta_days: 9,
    });
    assert.equal(o.option_key, 'melhorenvio:1:1');
    assert.equal(o.provider, 'melhorenvio');
  });
});
