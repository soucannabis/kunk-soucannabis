'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveConsultationPrice,
  resolvePayable,
  normalizeReportSettings,
  validateTypes,
} = require('../../src/services/professionalTypesConfig');

test('resolveConsultationPrice: explicit wins', () => {
  assert.equal(
    resolveConsultationPrice({ consultation_price: 100 }, 50, {
      association_fee: 0,
      default_consultation_price: 240,
    }),
    50
  );
});

test('resolveConsultationPrice: type default anula profissional', () => {
  assert.equal(
    resolveConsultationPrice({ consultation_price: 100 }, null, {
      association_fee: 20,
      default_consultation_price: 240,
    }),
    240
  );
});

test('resolveConsultationPrice: falls back to professional', () => {
  assert.equal(
    resolveConsultationPrice({ consultation_price: 110 }, null, {
      association_fee: 0,
      default_consultation_price: null,
    }),
    110
  );
});

test('resolvePayable: fee only by default', () => {
  const r = resolvePayable(
    { price: 220, donation: 20 },
    { association_fee: 20 },
    { deduct_donation_from_payable: false }
  );
  assert.equal(r.payable, 200);
  assert.equal(r.association_fee, 20);
  assert.equal(r.deduct_donation, false);
});

test('resolvePayable: donation deducted when flag on', () => {
  const r = resolvePayable(
    { price: 220, donation: 20 },
    { association_fee: 20 },
    { deduct_donation_from_payable: true }
  );
  assert.equal(r.payable, 180);
});

test('resolvePayable: never negative', () => {
  const r = resolvePayable({ price: 5, donation: 0 }, { association_fee: 20 }, {});
  assert.equal(r.payable, 0);
});

test('validateTypes rejects duplicate ids', () => {
  assert.throws(() =>
    validateTypes([
      { id: 'medic', label: 'A', association_fee: 0 },
      { id: 'medic', label: 'B', association_fee: 0 },
    ])
  );
});

test('normalizeReportSettings default false', () => {
  assert.deepEqual(normalizeReportSettings(null), { deduct_donation_from_payable: false });
});

test('normalizeProfessionalTypeId maps legacy physician to medic', () => {
  const { normalizeProfessionalTypeId } = require('../../src/services/professionalTypesConfig');
  assert.equal(normalizeProfessionalTypeId('physician'), 'medic');
  assert.equal(normalizeProfessionalTypeId('Médico'), 'medic');
  assert.equal(normalizeProfessionalTypeId('therapist'), 'therapist');
  assert.equal(normalizeProfessionalTypeId('psico'), 'psico');
});
