'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const institutional = require('../../src/services/institutionalClientsService');

/** CPF válido conhecido para testes. */
const VALID_CPF = '39053344705';
/** CNPJ válido conhecido para testes. */
const VALID_CNPJ = '11222333000181';

describe('institutionalClientsService helpers', () => {
  it('validates CPF and CNPJ', () => {
    assert.equal(institutional.isValidCpf(VALID_CPF), true);
    assert.equal(institutional.isValidCpf('11111111111'), false);
    assert.equal(institutional.isValidCnpj(VALID_CNPJ), true);
    assert.equal(institutional.isValidCnpj('00000000000000'), false);
  });

  it('displayName uses company when is_company', () => {
    assert.equal(
      institutional.displayName({
        is_company: true,
        company_name: 'Associação Verde',
        representative_name: 'Maria',
        representative_last_name: 'Silva',
      }),
      'Associação Verde'
    );
    assert.equal(
      institutional.displayName({
        is_company: false,
        company_name: 'Ignorado',
        representative_name: 'Maria',
        representative_last_name: 'Silva',
      }),
      'Maria Silva'
    );
  });

  it('receiverName is always the representative', () => {
    assert.equal(
      institutional.receiverName({
        is_company: true,
        company_name: 'Empresa X',
        representative_name: 'João',
        representative_last_name: 'Souza',
      }),
      'João Souza'
    );
  });

  it('shippingDocument uses CNPJ for company and CPF otherwise', () => {
    assert.equal(
      institutional.shippingDocument({
        is_company: true,
        company_cnpj: '11.222.333/0001-81',
        representative_cpf: VALID_CPF,
      }),
      VALID_CNPJ
    );
    assert.equal(
      institutional.shippingDocument({
        is_company: false,
        company_cnpj: VALID_CNPJ,
        representative_cpf: '390.533.447-05',
      }),
      VALID_CPF
    );
  });

  it('shippingPhone/Email prefer company contact when present', () => {
    const company = {
      is_company: true,
      company_phone: '11988887777',
      representative_mobile: '11999998888',
      company_email: 'empresa@ex.com',
      representative_email: 'rep@ex.com',
    };
    assert.equal(institutional.shippingPhone(company), '11988887777');
    assert.equal(institutional.shippingEmail(company), 'empresa@ex.com');

    const person = {
      is_company: false,
      company_phone: '11988887777',
      representative_mobile: '11999998888',
      company_email: 'empresa@ex.com',
      representative_email: 'rep@ex.com',
    };
    assert.equal(institutional.shippingPhone(person), '11999998888');
    assert.equal(institutional.shippingEmail(person), 'rep@ex.com');
  });

  it('validateClientFields requires company data when is_company', () => {
    assert.throws(
      () =>
        institutional.validateClientFields(
          {
            is_company: true,
            representative_name: 'Ana',
            representative_cpf: VALID_CPF,
            representative_mobile: '11987654321',
            representative_email: 'ana@ex.com',
            street: 'Rua A',
            cep: '01310100',
          },
          { partial: false }
        ),
      /Razão social|CNPJ/
    );

    assert.doesNotThrow(() =>
      institutional.validateClientFields(
        {
          is_company: true,
          company_name: 'Associação Demo',
          company_cnpj: VALID_CNPJ,
          representative_name: 'Ana',
          representative_cpf: VALID_CPF,
          representative_mobile: '11987654321',
          representative_email: 'ana@ex.com',
          street: 'Rua A',
          cep: '01310100',
        },
        { partial: false }
      )
    );
  });

  it('normalizePayload clears company fields when not company', () => {
    const body = institutional.normalizePayload({
      is_company: false,
      company_name: 'X',
      company_cnpj: VALID_CNPJ,
      representative_name: 'Ana',
      representative_cpf: VALID_CPF,
    });
    assert.equal(body.is_company, false);
    assert.equal(body.company_name, null);
    assert.equal(body.company_cnpj, null);
    assert.equal(body.representative_cpf, VALID_CPF);
  });
});
