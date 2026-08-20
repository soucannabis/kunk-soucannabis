'use strict';

/** Fases do funil em `users.associate_status` (pt-BR). */
const PHASE = {
  CADASTRO_CRIADO: 'cadastro_criado',
  DADOS_PESSOAIS: 'dados_pessoais',
  DOCUMENTOS: 'documentos',
  ASSINATURA_TERMO: 'assinatura_termo',
  CONCLUIDO: 'concluido',
};

/** Ordem do funil antes de Associado (sem `concluido`). */
const FUNNEL_ORDER = [
  PHASE.CADASTRO_CRIADO,
  PHASE.DADOS_PESSOAIS,
  PHASE.DOCUMENTOS,
  PHASE.ASSINATURA_TERMO,
];

const LEGACY_TO_PHASE = {
  1: PHASE.CADASTRO_CRIADO,
  2: PHASE.DADOS_PESSOAIS,
  3: PHASE.DOCUMENTOS,
  4: PHASE.ASSINATURA_TERMO,
  5: PHASE.ASSINATURA_TERMO,
  email_created: PHASE.CADASTRO_CRIADO,
  welcome: PHASE.CADASTRO_CRIADO,
  associate_data: PHASE.DADOS_PESSOAIS,
  patient_data: PHASE.DADOS_PESSOAIS,
  form_error: PHASE.DADOS_PESSOAIS,
  documents: PHASE.DOCUMENTOS,
  docs: PHASE.DOCUMENTOS,
  contract: PHASE.ASSINATURA_TERMO,
  signing: PHASE.ASSINATURA_TERMO,
  term: PHASE.ASSINATURA_TERMO,
  consultation: PHASE.ASSINATURA_TERMO,
  prescription: PHASE.ASSINATURA_TERMO,
  consulta: PHASE.ASSINATURA_TERMO,
};

function normalizePhase(value) {
  if (value == null || value === '') return PHASE.CADASTRO_CRIADO;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return LEGACY_TO_PHASE[value] || PHASE.CADASTRO_CRIADO;
  }
  const raw = String(value).trim();
  if (!raw) return PHASE.CADASTRO_CRIADO;
  if (Object.values(PHASE).includes(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && LEGACY_TO_PHASE[asNum]) return LEGACY_TO_PHASE[asNum];
  const lower = raw.toLowerCase();
  if (LEGACY_TO_PHASE[lower]) return LEGACY_TO_PHASE[lower];
  return PHASE.CADASTRO_CRIADO;
}

function phaseIndex(value) {
  const phase = normalizePhase(value);
  if (phase === PHASE.CONCLUIDO) return FUNNEL_ORDER.length;
  const idx = FUNNEL_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

function phaseAtMost(value, maxPhase) {
  return phaseIndex(value) <= phaseIndex(maxPhase);
}

function phaseEquals(value, expected) {
  return normalizePhase(value) === normalizePhase(expected);
}

function isFunnelPhase(value) {
  const phase = normalizePhase(value);
  return FUNNEL_ORDER.includes(phase);
}

function isAssociateStatus(user) {
  return String(user?.status || '') === 'Associado';
}

module.exports = {
  PHASE,
  FUNNEL_ORDER,
  LEGACY_TO_PHASE,
  normalizePhase,
  phaseIndex,
  phaseAtMost,
  phaseEquals,
  isFunnelPhase,
  isAssociateStatus,
};
