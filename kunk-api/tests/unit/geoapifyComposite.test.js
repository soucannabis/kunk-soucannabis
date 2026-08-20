'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateCompositeWithViaCep,
  MIN_CONFIDENCE_STREET,
  MIN_CONFIDENCE_STREET_RELAXED_VIACEP,
} = require('../../src/services/geoapify/composite');
const { crossCheckViaCep, buildViaCepReportFromPrefetched } = require('../../src/services/geoapify/viacep');
const { formatAddressText } = require('../../src/services/geoapify/validateAddress');

function feature({ street = 0.95, building = 0.8, city = 'Goiania', housenumber = '100', postcode = '74003010' } = {}) {
  return {
    properties: {
      formatted: `${housenumber} ${city}`,
      city,
      housenumber,
      postcode,
      result_type: 'building',
      rank: {
        confidence_street_level: street,
        confidence_building_level: building,
      },
    },
  };
}

function okViaCep(overrides = {}) {
  return {
    skipped: false,
    fetchOk: true,
    cepConsultado: '74003010',
    cepExisteNaBaseCorreios: true,
    error: null,
    data: {
      cep: '74003-010',
      logradouro: 'Avenida Anhanguera',
      bairro: 'Centro',
      localidade: 'Goiânia',
      uf: 'GO',
    },
    cruzamento: {
      localidadeMatch: true,
      ufMatch: true,
      logradouroClass: 'match',
      enderecoConsistenteComCep: true,
      ...overrides.cruzamento,
    },
    ...overrides,
  };
}

describe('geoapify composite + viacep', () => {
  const address = {
    street: 'Avenida Anhanguera',
    number: '100',
    neighborhood: 'Centro',
    city: 'Goiânia',
    state: 'GO',
    cep: '74003-010',
  };

  it('formatAddressText omits complement', () => {
    const t = formatAddressText({ ...address, complement: 'Apto 1' });
    assert.equal(t.includes('Apto'), false);
    assert.ok(t.includes('Anhanguera'));
  });

  it('crossCheck marks divergente street', () => {
    const r = crossCheckViaCep(address, {
      localidade: 'Goiânia',
      uf: 'GO',
      logradouro: 'Rua Completamente Diferente',
    });
    assert.equal(r.logradouroClass, 'divergente');
    assert.equal(r.enderecoConsistenteComCep, false);
  });

  it('buildViaCepReport handles cep not found', () => {
    const report = buildViaCepReportFromPrefetched(address, {
      httpOk: true,
      httpStatus: 200,
      data: { erro: true },
    });
    assert.equal(report.cepExisteNaBaseCorreios, false);
  });

  it('válido when ViaCEP consistent and street confidence high', () => {
    const r = evaluateCompositeWithViaCep([feature({ street: 0.95 })], address, okViaCep());
    assert.equal(r.status, 'válido');
    assert.equal(r.valid, true);
  });

  it('válido with relaxed street when ViaCEP ok', () => {
    const r = evaluateCompositeWithViaCep(
      [feature({ street: MIN_CONFIDENCE_STREET_RELAXED_VIACEP })],
      address,
      okViaCep()
    );
    assert.equal(r.status, 'válido');
    assert.equal(r.reason, 'geoapify_rua_confianca_reduzida_via_cep_ok');
  });

  it('revisar when Geoapify ok but ViaCEP inconsistent', () => {
    const viacep = okViaCep({
      cruzamento: {
        localidadeMatch: true,
        ufMatch: true,
        logradouroClass: 'divergente',
        enderecoConsistenteComCep: false,
      },
    });
    const r = evaluateCompositeWithViaCep([feature({ street: 0.95 })], address, viacep);
    assert.equal(r.status, 'revisar');
    assert.equal(r.reason, 'viacep_endereco_inconsistente_com_correios');
  });

  it('inválido when CEP not in Correios', () => {
    const r = evaluateCompositeWithViaCep([feature()], address, {
      skipped: false,
      fetchOk: true,
      cepExisteNaBaseCorreios: false,
      cruzamento: null,
    });
    assert.equal(r.status, 'inválido');
    assert.equal(r.reason, 'viacep_cep_nao_encontrado');
  });

  it('inválido when no features', () => {
    const r = evaluateCompositeWithViaCep([], address, okViaCep());
    assert.equal(r.status, 'inválido');
    assert.equal(r.reason, 'no_features');
  });

  it('inválido when street below thresholds', () => {
    const r = evaluateCompositeWithViaCep(
      [feature({ street: MIN_CONFIDENCE_STREET - 0.3 })],
      address,
      okViaCep()
    );
    assert.equal(r.status, 'inválido');
    assert.equal(r.reason, 'no_matching_candidate');
  });
});
