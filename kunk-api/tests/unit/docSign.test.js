'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateContentJson,
  applyVariablesToContent,
  resolveKind,
  resolveVariables,
  sampleVariables,
} = require('../../src/services/docSignVariables');
const { renderContentPdf, tipTapToDocDefinition } = require('../../src/services/docSignPdf');

describe('docSignVariables', () => {
  it('validates canonical variables', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'variable', attrs: { name: 'city' } }],
        },
      ],
    };
    assert.equal(validateContentJson(doc).ok, true);
  });

  it('rejects unknown variables', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'variable', attrs: { name: 'foo_bar' } }],
        },
      ],
    };
    const r = validateContentJson(doc);
    assert.equal(r.ok, false);
    assert.ok(r.unknown.includes('foo_bar'));
  });

  it('resolves kind and variables', () => {
    assert.equal(resolveKind({ responsible_type: 'pet' }), 'self');
    assert.equal(
      resolveKind({ responsible_type: 'pet', patient_user_code: 'pet-1' }),
      'with_patient'
    );
    assert.equal(
      resolveKind({ responsible_type: 'another', patient_user_code: 'x' }),
      'with_patient'
    );
    const vars = resolveVariables(
      {
        associate_name: 'Ana',
        associate_last_name: 'Silva',
        associate_cpf: '111',
        email_account: 'a@test.local',
        user_code: 'u1',
        city: 'BH',
      },
      { associate_name: 'Bob', associate_last_name: 'Silva', associate_cpf: '222' }
    );
    assert.equal(vars.responsible_full_name, 'Ana Silva');
    assert.equal(vars.patient_cpf, '222');
    assert.equal(vars.city, 'BH');
  });

  it('applies variables into content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Cidade ' },
            { type: 'variable', attrs: { name: 'city' } },
          ],
        },
      ],
    };
    const out = applyVariablesToContent(doc, { city: 'Anápolis' });
    assert.equal(out.content[0].content[1].text, 'Anápolis');
  });

  it('strips signature nodes and orphan Assinatura labels', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Assinatura: ' },
            { type: 'signature', attrs: { name: 'signature' } },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Fim' }],
        },
      ],
    };
    const out = applyVariablesToContent(doc, {});
    assert.equal(out.content.length, 1);
    assert.equal(out.content[0].content[0].text, 'Fim');
  });

  it('builds sample variables with overrides', () => {
    const vars = sampleVariables('with_patient', { city: 'Anápolis', responsible_full_name: 'Teste' });
    assert.equal(vars.city, 'Anápolis');
    assert.equal(vars.responsible_full_name, 'Teste');
    assert.ok(vars.patient_full_name);
    assert.equal(sampleVariables('self').patient_cpf, null);
  });
});

describe('docSignPdf', () => {
  it('builds pdfmake definition with Assinatura footer and renders buffer', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Termo' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Olá mundo', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    const def = tipTapToDocDefinition(doc);
    assert.ok(Array.isArray(def.content));
    const last = def.content[def.content.length - 1];
    assert.equal(last.columns[0].text, 'Assinatura:');
    assert.ok(String(last.columns[1].text).includes('_'));
    const { buffer, sha256 } = await renderContentPdf(doc);
    assert.ok(buffer.length > 100);
    assert.equal(typeof sha256, 'string');
  });

  it('places typed signature next to Assinatura label', () => {
    const def = tipTapToDocDefinition(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] },
      { typedName: 'Maria Silva' }
    );
    const last = def.content[def.content.length - 1];
    assert.equal(last.columns[0].text, 'Assinatura:');
    assert.equal(last.columns[1].text, 'Maria Silva');
  });
});
