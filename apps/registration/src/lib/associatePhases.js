/** Fases do funil em `users.associate_status` (pt-BR). Espelho da API. */

export const PHASE = {
  CADASTRO_CRIADO: 'cadastro_criado',
  DADOS_PESSOAIS: 'dados_pessoais',
  DOCUMENTOS: 'documentos',
  ASSINATURA_TERMO: 'assinatura_termo',
  CONCLUIDO: 'concluido',
};

export const FUNNEL_ORDER = [
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
};

export function normalizePhase(value) {
  if (value == null || value === '') return PHASE.CADASTRO_CRIADO;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return LEGACY_TO_PHASE[value] || PHASE.CADASTRO_CRIADO;
  }
  const raw = String(value).trim();
  if (!raw) return PHASE.CADASTRO_CRIADO;
  if (Object.values(PHASE).includes(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && LEGACY_TO_PHASE[asNum]) return LEGACY_TO_PHASE[asNum];
  return PHASE.CADASTRO_CRIADO;
}

export function phaseIndex(value) {
  const phase = normalizePhase(value);
  if (phase === PHASE.CONCLUIDO) return FUNNEL_ORDER.length;
  const idx = FUNNEL_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

export function isAssociado(user) {
  return String(user?.status || '') === 'Associado';
}

export function isConcluido(user) {
  return normalizePhase(user?.associate_status) === PHASE.CONCLUIDO;
}
