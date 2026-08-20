'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseStatuses,
  getAwaitingValue,
  getAwaitingApprovalValue,
  getPaidValue,
  isAllowedStatus,
  ORDER_STATUS_AWAITING,
  ORDER_STATUS_AWAITING_APPROVAL,
  ORDER_STATUS_PAID,
} = require('../../src/services/orderStatusesService');

describe('orderStatusesService', () => {
  it('parses defaults when empty', () => {
    const s = parseStatuses(null);
    assert.equal(getAwaitingValue(s), ORDER_STATUS_AWAITING);
    assert.equal(getPaidValue(s), ORDER_STATUS_PAID);
    assert.ok(isAllowedStatus(ORDER_STATUS_PAID, s));
    assert.equal(isAllowedStatus('Inventado', s), false);
  });

  it('keeps custom statuses', () => {
    const s = parseStatuses(
      JSON.stringify([
        { id: 'a', value: 'Aguardando pagamento', is_awaiting: true, system: true },
        { id: 'b', value: 'Pagamento concluído', is_paid: true, system: true },
        { id: 'c', value: 'Entregue', label: 'Entregue' },
      ])
    );
    assert.ok(isAllowedStatus('Entregue', s));
    // A regra atual garante o status de aprovação mesmo em catálogos antigos.
    assert.equal(s.length, 4);
    assert.equal(getAwaitingApprovalValue(s), ORDER_STATUS_AWAITING_APPROVAL);
    assert.ok(isAllowedStatus(ORDER_STATUS_AWAITING_APPROVAL, s));
  });
});
