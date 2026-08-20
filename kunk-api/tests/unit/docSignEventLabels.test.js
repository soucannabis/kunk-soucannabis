'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { eventLabel, withEventLabel } = require('../../src/services/docSignEventLabels');

describe('docSignEventLabels', () => {
  it('translates known term actions to Portuguese', () => {
    assert.equal(eventLabel('contract.created'), 'Termo criado');
    assert.equal(eventLabel('email.sent'), 'E-mail de assinatura enviado');
    assert.equal(eventLabel('email.confirmation_sent'), 'E-mail de confirmação enviado');
    assert.equal(eventLabel('form.viewed'), 'Termo visualizado');
    assert.equal(eventLabel('submission.started'), 'Assinatura iniciada');
    assert.equal(eventLabel('submission.completed'), 'Assinatura concluída');
  });

  it('never returns English event slugs', () => {
    assert.equal(eventLabel('email.unknown_hook'), 'E-mail enviado');
    assert.equal(eventLabel('contract.archived'), 'Ação no termo');
    assert.equal(eventLabel('something.else'), 'Ação do termo');
    assert.ok(!String(eventLabel('form.viewed')).includes('.'));
  });

  it('adds label on events', () => {
    const labeled = withEventLabel({ event_type: 'contract.created', actor_name: 'Ana' });
    assert.equal(labeled.label, 'Termo criado');
    assert.equal(labeled.event_type, 'contract.created');
  });
});
