'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const usersImportService = require('../../src/services/usersImportService');

describe('usersImportService helpers', () => {
  it('formats phone with +55 when missing DDI', () => {
    assert.equal(usersImportService.formatPhoneBr('62999990000'), '+5562999990000');
    assert.equal(usersImportService.formatPhoneBr('+5562999990000'), '+5562999990000');
    assert.equal(usersImportService.formatPhoneBr('5562999990000'), '+5562999990000');
    assert.equal(usersImportService.formatPhoneBr('123'), null);
  });

  it('formats CPF and CEP', () => {
    assert.equal(usersImportService.formatCpf('52998224725'), '529.982.247-25');
    assert.equal(usersImportService.isValidCpf('529.982.247-25'), true);
    assert.equal(usersImportService.isValidCpf('11111111111'), false);
    assert.equal(usersImportService.formatCep('01310100'), '01310-100');
  });

  it('suggests mapping from Portuguese headers', () => {
    const mapping = usersImportService.suggestMapping([
      'Nome',
      'Sobrenome',
      'Nome completo',
      'E-mail',
      'CPF',
      'Celular',
      'CEP',
      'Data de criação',
      'Coluna Ignorada',
    ]);
    assert.equal(mapping.Nome, 'associate_name');
    assert.equal(mapping.Sobrenome, 'associate_last_name');
    assert.equal(mapping['Nome completo'], 'fullname');
    assert.equal(mapping['E-mail'], 'email_account');
    assert.equal(mapping.CPF, 'associate_cpf');
    assert.equal(mapping.Celular, 'mobile_number');
    assert.equal(mapping.CEP, 'cep');
    assert.equal(mapping['Data de criação'], 'created_date');
    assert.equal(mapping['Coluna Ignorada'], null);
    assert.ok(!Object.values(mapping).includes('ciap_codes'));
    assert.ok(!Object.values(mapping).includes('associate_status'));
    assert.ok(!Object.values(mapping).includes('preferred_products'));
  });

  it('lists import fields with expected labels and order', () => {
    const { fields } = usersImportService.listImportFields();
    const keys = fields.map((f) => f.key);
    assert.equal(keys.indexOf('associate_last_name') < keys.indexOf('fullname'), true);
    assert.equal(fields.find((f) => f.key === 'email_account')?.label, 'E-mail');
    assert.ok(fields.some((f) => f.key === 'created_date' && f.label === 'Data de criação'));
    assert.ok(!fields.some((f) => f.key === 'email'));
    assert.ok(!fields.some((f) => f.key === 'status'));
    assert.ok(!fields.some((f) => f.key === 'ciap_codes'));
    assert.ok(!fields.some((f) => f.key === 'associate_status'));
    assert.ok(!fields.some((f) => f.key === 'preferred_products'));
    assert.equal(fields.find((f) => f.key === 'associate_last_name')?.requiredHint, true);
  });

  it('normalizes a valid mapped row', () => {
    const row = usersImportService.normalizeImportRow(
      {
        associate_name: 'Maria',
        associate_last_name: 'Silva',
        email_account: 'maria@import.test',
        associate_cpf: '52998224725',
        mobile_number: '11987654321',
        cep: '01310100',
        state: 'sp',
        created_date: '15/03/2024',
      },
      2
    );
    assert.equal(row.ok, true, row.errors.join('; '));
    assert.equal(row.payload.associate_cpf, '529.982.247-25');
    assert.equal(row.payload.mobile_number, '+5511987654321');
    assert.equal(row.payload.cep, '01310-100');
    assert.equal(row.payload.state, 'SP');
    assert.equal(row.payload.email_account, 'maria@import.test');
    assert.equal(row.payload.associate_status, 'cadastro_criado');
    assert.equal(row.payload.status, 'Associado');
    assert.ok(row.payload.created_date);
    assert.equal(new Date(row.payload.created_date).getFullYear(), 2024);
  });

  it('rejects invalid CPF and missing required fields with PT messages', () => {
    const bad = usersImportService.normalizeImportRow(
      {
        associate_cpf: '123',
        mobile_number: '99',
      },
      3
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /CPF/i.test(e)));
    assert.ok(bad.errors.some((e) => /Celular|telefone/i.test(e)));
    assert.ok(bad.errors.some((e) => /E-mail/i.test(e)));
    assert.ok(bad.errors.some((e) => /Nome/i.test(e)));
    assert.ok(bad.errors.some((e) => /Sobrenome/i.test(e)));
  });

  it('detects duplicate emails inside CSV via annotate flow shape', () => {
    const a = usersImportService.normalizeImportRow(
      { associate_name: 'A', associate_last_name: 'Um', email_account: 'dup@test.local' },
      2
    );
    const b = usersImportService.normalizeImportRow(
      { associate_name: 'B', associate_last_name: 'Dois', email_account: 'dup@test.local' },
      3
    );
    assert.equal(a.ok, true, a.errors.join('; '));
    assert.equal(b.ok, true, b.errors.join('; '));
    assert.equal(a.payload.email_account, b.payload.email_account);
  });
});
