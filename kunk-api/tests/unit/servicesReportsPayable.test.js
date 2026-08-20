'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enrichServicesWithPayable } = require('../../src/services/servicesReportsService');

const TYPES = [
  { id: 'medic', label: 'Médico', association_fee: 30, active: true },
  { id: 'therapist', label: 'Terapeuta', association_fee: 0, active: true },
  { id: 'psico', label: 'Psicólogo', association_fee: 15, active: true },
];

const SETTINGS = { deduct_donation_from_payable: false };

test('payable desconta association_fee do tipo do profissional (não de services.type)', () => {
  const professionalsByCode = {
    'pro-medic': { professional_code: 'pro-medic', type: 'medic' },
  };
  const { services, totals } = enrichServicesWithPayable(
    [
      {
        id: 1,
        // services.type = modalidade do atendimento — NÃO deve definir a taxa
        type: 'consulta',
        price: 200,
        donation: 0,
        professional_id: 'pro-medic',
      },
    ],
    professionalsByCode,
    TYPES,
    SETTINGS
  );

  assert.equal(services[0].professional_type, 'medic');
  assert.equal(services[0].association_fee, 30);
  assert.equal(services[0].payable, 170);
  assert.equal(totals.payable_sum, 170);
  assert.equal(totals.association_fee_sum, 30);
  assert.equal(totals.count, 1);
});

test('cada linha aplica a taxa do tipo; total = soma dos payables com desconto', () => {
  const professionalsByCode = {
    'pro-medic': { professional_code: 'pro-medic', type: 'medic' },
    'pro-psico': { professional_code: 'pro-psico', type: 'psico' },
  };
  const { services, totals } = enrichServicesWithPayable(
    [
      { id: 1, type: 'consulta', price: 200, donation: 0, professional_id: 'pro-medic' },
      { id: 2, type: 'retorno', price: 150, donation: 0, professional_id: 'pro-medic' },
      { id: 3, type: 'consulta', price: 100, donation: 0, professional_id: 'pro-psico' },
    ],
    professionalsByCode,
    TYPES,
    SETTINGS
  );

  assert.deepEqual(
    services.map((s) => s.payable),
    [170, 120, 85]
  );
  assert.equal(totals.payable_sum, 170 + 120 + 85);
  assert.equal(totals.association_fee_sum, 30 + 30 + 15);
});

test('alias legado physician resolve taxa de medic', () => {
  const professionalsByCode = {
    'pro-1': { professional_code: 'pro-1', type: 'physician' },
  };
  const { services } = enrichServicesWithPayable(
    [{ id: 1, type: 'consulta', price: 230, donation: 0, professional_id: 'pro-1' }],
    professionalsByCode,
    TYPES,
    SETTINGS
  );
  assert.equal(services[0].professional_type, 'medic');
  assert.equal(services[0].association_fee, 30);
  assert.equal(services[0].payable, 200);
});

test('sem taxa no tipo: payable = price', () => {
  const professionalsByCode = {
    'pro-t': { professional_code: 'pro-t', type: 'therapist' },
  };
  const { services, totals } = enrichServicesWithPayable(
    [{ id: 1, type: 'consulta', price: 180, donation: 0, professional_id: 'pro-t' }],
    professionalsByCode,
    TYPES,
    SETTINGS
  );
  assert.equal(services[0].association_fee, 0);
  assert.equal(services[0].payable, 180);
  assert.equal(totals.payable_sum, 180);
});

test('profissional ausente: taxa 0 (não usa services.type como fee)', () => {
  const { services } = enrichServicesWithPayable(
    [{ id: 1, type: 'medic', price: 200, donation: 0, professional_id: 'missing' }],
    {},
    TYPES,
    SETTINGS
  );
  assert.equal(services[0].association_fee, 0);
  assert.equal(services[0].payable, 200);
});

test('flag deduct_donation_from_payable: desconta doação além da taxa', () => {
  const professionalsByCode = {
    'pro-medic': { professional_code: 'pro-medic', type: 'medic' },
  };
  const { services } = enrichServicesWithPayable(
    [{ id: 1, type: 'consulta', price: 200, donation: 20, professional_id: 'pro-medic' }],
    professionalsByCode,
    TYPES,
    { deduct_donation_from_payable: true }
  );
  // 200 - 30 (taxa) - 20 (doação) = 150
  assert.equal(services[0].payable, 150);
});
