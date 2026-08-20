/** Shared constants and payloads for registration E2E. */

export const FRONT_URL = process.env.E2E_FRONT_URL || 'http://localhost:4255';
/** Railway/produção: front e API em origens distintas. */
export const isRemoteE2E = /^https?:\/\/(?!localhost)/i.test(FRONT_URL);
/** Hit API via Vite proxy so session cookies share the front origin. */
export const API_URL = process.env.E2E_API_URL || `${FRONT_URL}/api/v1`;
export const VALID_CPF = '52998224725';
export const PASSWORD = 'senha123';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

export function responsiblePayload(overrides = {}) {
  return {
    responsible_type: 'himself',
    associate_name: 'Ana',
    associate_last_name: 'Silva',
    associate_birth_date: '1990-01-15',
    gender: 'mulher-cis',
    nationality: 'Brasileiro(a)',
    associate_cpf: VALID_CPF,
    associate_rg: '1234567',
    associate_rg_issuer: 'SSP/SP',
    marital_status: 'Solteiro(a)',
    mobile_number: '5511999999999',
    street: 'Rua A',
    street_number: '100',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    cep: '01310100',
    reason_treatment_text: 'Dor crônica',
    ciap_codes: ['A01', 'P01'],
    ...overrides,
  };
}

export function patientPayload(overrides = {}) {
  return {
    associate_name: 'João',
    associate_last_name: 'Souza',
    associate_birth_date: '2010-05-01',
    gender: 'homem-cis',
    nationality: 'Brasileiro(a)',
    associate_cpf: VALID_CPF,
    associate_rg: '7654321',
    associate_rg_issuer: 'SSP/SP',
    ciap_codes: ['N01'],
    reason_treatment_text: 'Cefaleia',
    ...overrides,
  };
}
