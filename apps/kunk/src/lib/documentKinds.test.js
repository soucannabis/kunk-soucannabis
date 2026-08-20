import { describe, expect, it } from 'vitest';
import { DOCUMENT_KINDS, buildDocumentFileName, getDocumentKind } from './documentKinds.js';

describe('documentKinds', () => {
  it('uses doc-associado- and receita- prefixes', () => {
    expect(DOCUMENT_KINDS.identity_responsible.prefix).toBe('doc-associado-');
    expect(DOCUMENT_KINDS.prescription.prefix).toBe('receita-');
    expect(getDocumentKind('prescription').doc_kind).toBe('prescription');
  });

  it('builds renamed filename with prefix', () => {
    const name = buildDocumentFileName('prescription', {
      associate_name: 'Maria',
      associate_last_name: 'Silva',
      user_code: 'abc-123',
    }, 'scan.PDF');
    expect(name).toBe('receita-Maria-Silva-abc-123.pdf');
  });

  it('builds associate identity filename', () => {
    const name = buildDocumentFileName('identity_responsible', {
      associate_name: 'João',
      associate_last_name: 'Çosta',
      user_code: 'u1',
    }, 'rg.jpg');
    expect(name).toBe('doc-associado-Joao-Costa-u1.jpg');
  });
});
