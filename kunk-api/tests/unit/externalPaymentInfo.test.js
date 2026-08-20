'use strict';

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('enrichExternalPaymentInfo', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('inclui associação, split com % + reais e recipients completos', async () => {
    mock.method(require('../../src/services/soucannabis_orders/config'), 'getScConfig', async () => ({
      enabled: true,
      payment_percentage: 10,
    }));
    mock.method(require('../../src/services/pagarme/config'), 'getPagarmeConfig', async () => ({
      soucannabis_recipient_id: 'rp_sc',
      association_recipient_id: 'rp_assoc',
    }));
    mock.method(
      require('../../src/services/systemConfigService'),
      'resolveAll',
      async () => ({ values: { VITE_ASSOCIATION_NAME: 'Assoc Teste' } })
    );
    mock.method(
      require('../../src/services/storeFreightConfig'),
      'getStoreFreightConfig',
      async () => ({
        ship_from: {
          name: 'Associação de saúde',
          document: '43624868000175',
          phone: '6298364889',
          street: 'Rua A',
          number: '1',
          city: 'Anápolis',
          state: 'GO',
          cep: '75093750',
        },
      })
    );
    mock.method(require('../../src/services/pagarme/client'), 'request', async (path) => {
      if (String(path).includes('rp_sc')) {
        return { id: 'rp_sc', name: 'SouCannabis', document: '111', type: 'company' };
      }
      return { id: 'rp_assoc', name: 'Associação', document: '43624868000175', type: 'company' };
    });

    const { enrichExternalPaymentInfo } = require('../../src/services/soucannabis_orders/externalPaymentInfo');
    const info = await enrichExternalPaymentInfo(
      { id: 86, order_code: 'ORD-86', total: 555 },
      { provider: 'manual', method: 'test' }
    );

    assert.equal(info.association.name, 'Assoc Teste');
    assert.equal(info.association.document, '43624868000175');
    assert.equal(info.payment_percentage, 10);
    assert.equal(info.split.length, 2);
    assert.equal(info.split[0].role, 'soucannabis');
    assert.equal(info.split[0].percentage, 10);
    assert.equal(info.split[0].amount_reais, 55.5);
    assert.equal(info.split[0].recipient.id, 'rp_sc');
    assert.equal(info.split[1].role, 'association');
    assert.equal(info.split[1].percentage, 90);
    assert.equal(info.split[1].amount_reais, 499.5);
    assert.equal(info.split[1].recipient.name, 'Associação');
    assert.equal(info.recipients.length, 2);
    assert.equal(info.recipients[1].document, '43624868000175');
  });
});
