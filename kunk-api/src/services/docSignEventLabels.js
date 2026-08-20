'use strict';

/** Labels PT-BR das ações do termo. Slugs internos permanecem em inglês. */
const EVENT_LABELS = {
  'contract.created': 'Termo criado',
  'contract.voided': 'Termo anulado',
  'email.sent': 'E-mail de assinatura enviado',
  'email.confirmation_sent': 'E-mail de confirmação enviado',
  'form.viewed': 'Termo visualizado',
  'submission.started': 'Assinatura iniciada',
  'submission.completed': 'Assinatura concluída',
};

function eventLabel(type) {
  const key = String(type || '').trim();
  if (!key) return '—';
  if (EVENT_LABELS[key]) return EVENT_LABELS[key];
  if (key.startsWith('email.')) return 'E-mail enviado';
  if (key.startsWith('submission.')) return 'Assinatura';
  if (key.startsWith('form.')) return 'Termo visualizado';
  if (key.startsWith('contract.')) return 'Ação no termo';
  return 'Ação do termo';
}

function withEventLabel(event) {
  if (!event) return event;
  return { ...event, label: eventLabel(event.event_type) };
}

module.exports = {
  EVENT_LABELS,
  eventLabel,
  withEventLabel,
};
