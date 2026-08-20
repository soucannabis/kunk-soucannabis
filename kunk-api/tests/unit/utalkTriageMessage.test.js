'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { renderTriageMessage } = require('../../src/services/utalk/triageMessage');
const {
  normalizeToUtalkPhone,
  assertFromPhoneE164,
} = require('../../src/services/utalk/client');

describe('utalk triage message', () => {
  it('renderiza placeholders de nome e telefone', () => {
    const out = renderTriageMessage('Olá {{nome}}, tel {{telefone}}', {
      name: 'Ana',
      last_name: 'Silva',
      phone: '62999990000',
    });
    assert.equal(out, 'Olá Ana Silva, tel 62999990000');
  });

  it('normalizeToUtalkPhone adiciona 55', () => {
    assert.equal(normalizeToUtalkPhone('(62) 99999-0000'), '5562999990000');
    assert.equal(normalizeToUtalkPhone('+5562999990000'), '5562999990000');
    assert.equal(normalizeToUtalkPhone(''), null);
  });

  it('assertFromPhoneE164 aceita +55 ou dígitos com DDI', () => {
    assert.equal(assertFromPhoneE164('+5562999999999'), '+5562999999999');
    assert.equal(assertFromPhoneE164('5562999999999'), '+5562999999999');
    assert.throws(() => assertFromPhoneE164(''), (err) => err.code === 'VALIDATION_ERROR');
    assert.throws(() => assertFromPhoneE164('62999999999'), (err) => err.code === 'VALIDATION_ERROR');
    assert.throws(() => assertFromPhoneE164('+55629999'), (err) => err.code === 'VALIDATION_ERROR');
  });
});
