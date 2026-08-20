'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePeriod,
  normalizeGenderValue,
  normalizeBrazilStateToUf,
  ageBracketLabel,
  ageYearsFromBirth,
  classifyCompletionReason,
} = require('../../src/services/analyticsService');

test('parsePeriod defaults and swaps inverted range', () => {
  const p = parsePeriod({ start: '2026-06-01', end: '2026-01-01', group_by: 'week' });
  assert.equal(p.start, '2026-01-01');
  assert.equal(p.end, '2026-06-01');
  assert.equal(p.group_by, 'week');
});

test('parsePeriod rejects invalid dates', () => {
  assert.throws(() => parsePeriod({ start: 'nope', end: '2026-01-01' }));
});

test('parsePeriod falls back invalid group_by', () => {
  const p = parsePeriod({ start: '2026-01-01', end: '2026-01-31', group_by: 'hour' });
  assert.equal(p.group_by, 'month');
});

test('normalizeBrazilStateToUf', () => {
  assert.equal(normalizeBrazilStateToUf('sp'), 'SP');
  assert.equal(normalizeBrazilStateToUf('São Paulo'), 'SP');
  assert.equal(normalizeBrazilStateToUf('rio de janeiro'), 'RJ');
});

test('normalizeGenderValue', () => {
  assert.equal(normalizeGenderValue('homem-cis'), 'Homem Cis');
  assert.equal(normalizeGenderValue('feminino'), 'Mulher Cis');
  assert.equal(normalizeGenderValue(''), 'Não Informado');
  assert.equal(normalizeGenderValue('mulher-trans'), 'Mulher Trans');
});

test('ageBracketLabel and ageYearsFromBirth', () => {
  const birth = new Date('1990-06-15');
  const now = new Date('2026-06-15');
  assert.equal(ageYearsFromBirth(birth, now), 36);
  assert.equal(ageBracketLabel(36), '35-44');
  assert.equal(ageBracketLabel(70), '65+');
  assert.equal(ageBracketLabel(null), 'Sem data');
});

test('classifyCompletionReason', () => {
  assert.equal(classifyCompletionReason('Pedido'), 'order');
  assert.equal(classifyCompletionReason('Serviço'), 'service');
  assert.equal(classifyCompletionReason('Atendido'), 'other');
});
