'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('soucannabis_orders mapOrderPayload', () => {
  it('maps create payload with user full name and external_payment_info', async () => {
    mock.method(
      require('../../src/services/orderStatusesService'),
      'getOrderStatuses',
      async () => [
        { value: 'Aguardando pagamento' },
        { value: 'Pagamento concluído' },
      ]
    );
    mock.method(
      require('../../src/services/orderStatusesService'),
      'getPaidValue',
      () => 'Pagamento concluído'
    );

    const { toRemoteCreatePayload } = require('../../src/services/soucannabis_orders/mapOrderPayload');
    const payload = await toRemoteCreatePayload(
      {
        id: 9,
        order_code: 'ORD-1',
        user_code: 'U1',
        associate_name: 'Fallback',
        items: [{ code: 'P1', name: 'Óleo', quantity: 2, amount: 50 }],
        total: 100,
        tags: ['a', { tag: 'b' }],
        address: { street: 'Rua A', number: '1', city: 'SP', state: 'SP', cep: '01000-000' },
      },
      {
        userRow: { associate_name: 'Ana', associate_last_name: 'Silva' },
        externalPaymentInfo: { provider: 'pagarme', payment_method: 'credit_card' },
      }
    );

    assert.equal(payload.external_id, 'ORD-1');
    assert.equal(payload.user, undefined);
    assert.equal(payload.name_associate, 'Ana Silva');
    assert.equal(payload.user_code, 'U1');
    assert.equal(payload.status, 'Aguardando aprovação');
    assert.deepEqual(payload.tags, ['a', 'b']);
    assert.equal(payload.external_payment_info.provider, 'pagarme');
    assert.equal(payload.items[0].quantity, 2);
  });

  it('toRemotePatchPayload mapeia só o delta e omite nulls acidentais', () => {
    const { toRemotePatchPayload } = require('../../src/services/soucannabis_orders/mapOrderPayload');
    const patch = toRemotePatchPayload({
      receiver_name: 'Novo Nome',
      address: { street: 'Rua X', number: '10', city: 'SP', state: 'SP', cep: '01000-000' },
      tags: null,
      payment_method: null,
      payment_date: null,
      user_code: null,
      ignored_remote_field: 'ignored',
    });
    assert.equal(patch.name_associate, 'Novo Nome');
    assert.equal(patch.address.street, 'Rua X');
    assert.equal(patch.payment_date, null);
    assert.equal(patch.tags, undefined);
    assert.equal(patch.payment_form, undefined);
    assert.equal(patch.user_code, undefined);
    assert.equal(patch.ignored_remote_field, undefined);
  });

  it('bodyToLocalOutboundPatch atualiza nome nos dois campos e protege endereço/itens', () => {
    const { bodyToLocalOutboundPatch } = require('../../src/services/soucannabis_orders/outbound');
    const patch = bodyToLocalOutboundPatch(
      {
        name_associate: 'KUNK TESTE999',
        address: { street: 'Rua Nova', number: '10', city: 'SP', state: 'SP', cep: '01000-000' },
        status: 'Pagamento concluído',
      },
      {
        items: [{ cod: 'A', quantity: 1, amount: 10 }],
        address: { street: 'Antiga' },
        receiver_name: 'Velho',
        associate_name: 'Velho',
      }
    );
    assert.equal(patch.associate_name, 'KUNK TESTE999');
    assert.equal(patch.receiver_name, 'KUNK TESTE999');
    assert.equal(patch.address.street, 'Rua Nova');
    assert.equal(patch.status, 'Pagamento concluído');

    const wipe = bodyToLocalOutboundPatch(
      {
        name_associate: '   ',
        address: { number: '1' },
        items: [],
        tags: null,
      },
      {
        items: [{ cod: 'A', quantity: 1, amount: 10 }],
        associate_name: 'Keep',
        receiver_name: 'Keep',
        address: { street: 'Rua OK' },
      }
    );
    assert.equal(wipe.associate_name, undefined);
    assert.equal(wipe.receiver_name, undefined);
    assert.equal(wipe.address, undefined);
    assert.equal(wipe.items, undefined);
  });

  it('bodyToLocalOutboundPatch aplica tracking e external_delivery_type', () => {
    const { bodyToLocalOutboundPatch } = require('../../src/services/soucannabis_orders/outbound');
    const patch = bodyToLocalOutboundPatch(
      {
        tracking_code: 'AC123',
        tracking_code_date: '2026-07-16T12:00:00.000Z',
        external_delivery_type: 'Loggi',
      },
      {}
    );
    assert.equal(patch.tracking_code, 'AC123');
    assert.equal(patch.tracking_code_date, '2026-07-16T12:00:00.000Z');
    assert.equal(patch.external_delivery_type, 'loggi');
  });

  it('toRemotePatchPayload espelha external_delivery_type', () => {
    const { toRemotePatchPayload } = require('../../src/services/soucannabis_orders/mapOrderPayload');
    const patch = toRemotePatchPayload({
      tracking_code: 'AC123',
      external_delivery_type: 'loggi',
    });
    assert.equal(patch.tracking_code, 'AC123');
    assert.equal(patch.external_delivery_type, 'loggi');
  });

  it('bodyToLocalOutboundPatch sem allowClear descarta null (comportamento outbound)', () => {
    const { bodyToLocalOutboundPatch } = require('../../src/services/soucannabis_orders/outbound');
    const patch = bodyToLocalOutboundPatch(
      { tracking_code: null, external_delivery_type: null },
      { tracking_code: 'OLD', external_delivery_type: 'loggi' }
    );
    assert.equal('tracking_code' in patch, false);
    assert.equal('external_delivery_type' in patch, false);
  });

  it('bodyToLocalOutboundPatch com allowClear limpa null explícito (webhook)', () => {
    const { bodyToLocalOutboundPatch } = require('../../src/services/soucannabis_orders/outbound');
    const patch = bodyToLocalOutboundPatch(
      {
        tracking_code: null,
        tracking_code_date: null,
        external_delivery_type: '',
        external_payment_info: null,
      },
      { tracking_code: 'OLD', external_delivery_type: 'loggi' },
      { allowClear: true }
    );
    assert.equal(patch.tracking_code, null);
    assert.equal(patch.tracking_code_date, null);
    assert.equal(patch.external_delivery_type, null);
    assert.equal(patch.external_payment_info, null);
  });

  it('bodyToLocalOutboundPatch com allowClear não toca campo ausente', () => {
    const { bodyToLocalOutboundPatch } = require('../../src/services/soucannabis_orders/outbound');
    const patch = bodyToLocalOutboundPatch(
      { tracking_code: 'NEW' },
      { tracking_code: 'OLD', external_delivery_type: 'loggi' },
      { allowClear: true }
    );
    assert.equal(patch.tracking_code, 'NEW');
    assert.equal('external_delivery_type' in patch, false);
  });
});
