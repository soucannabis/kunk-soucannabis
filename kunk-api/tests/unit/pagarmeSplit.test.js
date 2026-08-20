'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertIntegerPercentage,
  isIntegerPercentage,
  buildSplitRules,
} = require('../../src/services/pagarme/split');

describe('pagarme split percentage', () => {
  it('accepts integer 0–100', () => {
    assert.equal(assertIntegerPercentage(8), 8);
    assert.equal(assertIntegerPercentage('12'), 12);
    assert.equal(assertIntegerPercentage(0), 0);
    assert.equal(assertIntegerPercentage(100), 100);
  });

  it('rejects decimals and out of range', () => {
    assert.equal(isIntegerPercentage(8.5), false);
    assert.equal(isIntegerPercentage('8.0'), false);
    assert.equal(isIntegerPercentage(-1), false);
    assert.equal(isIntegerPercentage(101), false);
    assert.throws(() => assertIntegerPercentage(8.5), (err) => err.code === 'PAYMENT_PERCENTAGE_NOT_INTEGER');
  });

  it('builds percentage split SC + association', () => {
    const rules = buildSplitRules({
      paymentPercentage: 20,
      soucannabisRecipientId: 'rp_sc',
      associationRecipientId: 'rp_assoc',
    });
    assert.equal(rules.length, 2);
    assert.equal(rules[0].amount, 20);
    assert.equal(rules[0].type, 'percentage');
    assert.equal(rules[0].recipient_id, 'rp_sc');
    assert.equal(rules[0].options.liable, false);
    assert.equal(rules[1].amount, 80);
    assert.equal(rules[1].recipient_id, 'rp_assoc');
    assert.equal(rules[1].options.liable, true);
  });

  it('splitAmountsFromTotal calcula % e reais', () => {
    const { splitAmountsFromTotal } = require('../../src/services/pagarme/split');
    const a = splitAmountsFromTotal(555, 10);
    assert.equal(a.total_cents, 55500);
    assert.equal(a.soucannabis.percentage, 10);
    assert.equal(a.soucannabis.amount_cents, 5550);
    assert.equal(a.soucannabis.amount_reais, 55.5);
    assert.equal(a.association.percentage, 90);
    assert.equal(a.association.amount_cents, 49950);
    assert.equal(a.association.amount_reais, 499.5);
  });
});
