'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isCollaboratorTrue,
  isPrescriberTrue,
  isFlagTrue,
} = require('../../src/utils/professionalFlags');
const { allowedPagesForRoles, filterMenuSections } = require('../../src/utils/rolePages');
const { defaultPriceForType } = require('../../src/services/servicesService');

describe('professionalFlags', () => {
  it('accepts Sim/true/1', () => {
    assert.equal(isCollaboratorTrue('Sim'), true);
    assert.equal(isCollaboratorTrue('true'), true);
    assert.equal(isCollaboratorTrue(1), true);
    assert.equal(isPrescriberTrue(true), true);
  });

  it('rejects Não/false', () => {
    assert.equal(isFlagTrue('Não'), false);
    assert.equal(isFlagTrue(false), false);
    assert.equal(isFlagTrue(null), false);
  });
});

describe('rolePages', () => {
  it('defaults to all when missing', () => {
    assert.deepEqual(allowedPagesForRoles(null, ['Produção']), ['*']);
  });

  it('unions pages across roles', () => {
    const pages = allowedPagesForRoles(
      { Produção: ['servicos'], Acolhimento: ['pedidos'] },
      ['Produção', 'Acolhimento']
    );
    assert.ok(pages.includes('servicos'));
    assert.ok(pages.includes('pedidos'));
  });

  it('filters menu sections', () => {
    const sections = [
      { id: 'a', items: [{ id: 'servicos', label: 'S' }, { id: 'triagem', label: 'T' }] },
    ];
    const filtered = filterMenuSections(sections, ['servicos']);
    assert.equal(filtered[0].items.length, 1);
    assert.equal(filtered[0].items[0].id, 'servicos');
  });
});

describe('defaultPriceForType', () => {
  it('returns 0 when price is not defined', () => {
    assert.equal(defaultPriceForType('medic'), 0);
    assert.equal(defaultPriceForType('psychiatrist'), 0);
    assert.equal(defaultPriceForType('assist_social'), 0);
    assert.equal(defaultPriceForType('psico'), 0);
    assert.equal(defaultPriceForType(undefined), 0);
  });
});
