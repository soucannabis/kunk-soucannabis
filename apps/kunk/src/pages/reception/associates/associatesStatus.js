/** Mapa de status/fases OSS → labels da lista de associados */

const PHASE = {
  CADASTRO_CRIADO: 'cadastro_criado',
  DADOS_PESSOAIS: 'dados_pessoais',
  DOCUMENTOS: 'documentos',
  ASSINATURA_TERMO: 'assinatura_termo',
  CONCLUIDO: 'concluido',
};

const LEGACY_TO_PHASE = {
  1: PHASE.CADASTRO_CRIADO,
  2: PHASE.DADOS_PESSOAIS,
  3: PHASE.DOCUMENTOS,
  4: PHASE.ASSINATURA_TERMO,
  5: PHASE.ASSINATURA_TERMO,
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
  return PHASE.CADASTRO_CRIADO;
}

export {
  SIDEBAR_Z,
  CONTENT_AREA_DIALOG_Z,
  CONTENT_AREA_OVERLAY_Z,
  contentAreaSelectProps,
  contentAreaAutocompleteSlotProps,
  contentAreaDialogSx,
  contentAreaDialogProps,
  contentAreaModalSx,
} from '../../../layout/contentAreaOverlay.js';

export const FILTER_ALL = '';
export const FILTER_ASSOCIADO = 'Associado';
export const FILTER_PHASE_1 = 'phase_1';
export const FILTER_PHASE_2 = 'phase_2';
export const FILTER_PHASE_3 = 'phase_3';
export const FILTER_PHASE_4 = 'phase_4';
export const FILTER_INVALID = 'invalid';

export const LABEL_ASSOCIADO = 'Associado';
export const LABEL_PHASE_1 = 'Não preencheu os dados';
export const LABEL_PHASE_2 = 'Apenas preencheu os dados';
export const LABEL_PHASE_3 = 'Documentos enviados';
export const LABEL_PHASE_4 = 'Termo criado';
export const LABEL_PROBLEMA = 'Problema no cadastro';

export const FILTER_OPTIONS = [
  { value: FILTER_ASSOCIADO, label: LABEL_ASSOCIADO },
  { value: FILTER_PHASE_1, label: LABEL_PHASE_1 },
  { value: FILTER_PHASE_2, label: LABEL_PHASE_2 },
  { value: FILTER_PHASE_3, label: LABEL_PHASE_3 },
  { value: FILTER_PHASE_4, label: LABEL_PHASE_4 },
  { value: FILTER_INVALID, label: LABEL_PROBLEMA },
];

/** Labels PT para campos em `invalid_fields` (hover Problema no cadastro). */
export const FIELD_LABELS_PT = {
  responsible_type: 'Tipo de cadastro',
  associate_name: 'Nome',
  associate_last_name: 'Sobrenome',
  associate_birth_date: 'Nascimento',
  gender: 'Gênero',
  nationality: 'Nacionalidade',
  associate_cpf: 'CPF',
  associate_rg: 'RG',
  associate_rg_issuer: 'Órgão emissor',
  marital_status: 'Estado civil',
  account_password: 'Senha',
  mobile_number: 'Celular',
  street: 'Rua',
  street_number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  cep: 'CEP',
  reason_treatment_text: 'Descreva o motivo',
  reason_treatment: 'CIAP2',
  ciap_codes: 'Motivo principal para o tratamento',
  email_account: 'E-mail',
  pass: 'Senha',
};

export function displayName(user) {
  if (!user) return '—';
  if (user.fullname) return String(user.fullname).trim();
  return [user.associate_name, user.associate_last_name].filter(Boolean).join(' ').trim() || '—';
}

export function parseInvalidFields(user) {
  const raw = user?.invalid_fields;
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const text = String(raw).trim();
  if (!text || text === '[]' || text === '{}') return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.emptyFields)) return parsed.emptyFields.map(String).filter(Boolean);
      if (parsed.formError?.emptyFields) {
        return (parsed.formError.emptyFields || []).map(String).filter(Boolean);
      }
      return Object.keys(parsed);
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function hasInvalidFields(user) {
  return parseInvalidFields(user).length > 0;
}

export function labelForField(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  return FIELD_LABELS_PT[k] || k;
}

export function labelsForInvalidFields(user) {
  return parseInvalidFields(user).map(labelForField).filter(Boolean);
}

/** Sem problema no cadastro — usado nos filtros de fase (invalid tem filtro próprio). */
const NO_INVALID_FIELDS = {
  _or: [
    { invalid_fields: { _null: true } },
    { invalid_fields: { _eq: '' } },
    { invalid_fields: { _eq: '[]' } },
    { invalid_fields: { _eq: '{}' } },
  ],
};

export function statusLabel(user) {
  if (!user) return '—';
  if (String(user.status) === 'Associado') return LABEL_ASSOCIADO;
  if (String(user.status) === 'patient') return 'Paciente';

  if (hasInvalidFields(user)) return LABEL_PROBLEMA;

  // Legado em `status` (antes do funil pt-BR em associate_status).
  if (String(user.status) === 'published') return LABEL_PHASE_1;
  if (String(user.status) === 'registered') return LABEL_PHASE_2;
  if (String(user.status) === 'proofs') return LABEL_PHASE_4;

  // Fase canônica: associate_status. Não usar status=cadastro_criado como “fase 1” —
  // esse valor permanece em status durante todo o funil até virar Associado.
  const phase = normalizePhase(user.associate_status);
  if (phase === PHASE.CADASTRO_CRIADO) return LABEL_PHASE_1;
  if (phase === PHASE.DADOS_PESSOAIS) return LABEL_PHASE_2;
  if (phase === PHASE.DOCUMENTOS) return LABEL_PHASE_3;
  if (phase === PHASE.ASSINATURA_TERMO) return LABEL_PHASE_4;
  // concluido sem status Associado (raro) — exibe como Associado no painel.
  if (phase === PHASE.CONCLUIDO) return LABEL_ASSOCIADO;
  return String(user.status || '—');
}

export function statusTooltip(user) {
  const label = statusLabel(user);
  if (label === LABEL_PHASE_1) {
    return 'Colocou o e-mail de cadastro mas não preencheu seus dados pessoais.';
  }
  if (label === LABEL_PHASE_2) {
    return 'Preencheu seus dados mas não seguiu com o cadastro';
  }
  if (label === LABEL_PHASE_3) return 'Documentos enviados';
  if (label === LABEL_PHASE_4) return 'Termo criado (aguardando assinatura)';
  if (label === LABEL_ASSOCIADO) return 'Se tornou associado';
  if (label === LABEL_PROBLEMA) {
    const fields = labelsForInvalidFields(user);
    if (fields.length) return `Os campos não foram preenchidos: ${fields.join(', ')}`;
    return 'Os campos não foram preenchidos';
  }
  return label;
}

export function matchesFilter(user, filter) {
  if (!filter) return true;
  const label = statusLabel(user);
  if (filter === FILTER_ASSOCIADO) return label === LABEL_ASSOCIADO;
  if (filter === FILTER_PHASE_1) return label === LABEL_PHASE_1;
  if (filter === FILTER_PHASE_2) return label === LABEL_PHASE_2;
  if (filter === FILTER_PHASE_3) return label === LABEL_PHASE_3;
  if (filter === FILTER_PHASE_4) return label === LABEL_PHASE_4;
  if (filter === FILTER_INVALID) return label === LABEL_PROBLEMA;
  return true;
}

/** Filtro de status OSS para GET /users (AND com status ≠ patient no caller). */
export function statusFilterToApiNode(filter) {
  if (!filter) return null;

  if (filter === FILTER_ASSOCIADO) {
    return { status: { _eq: 'Associado' } };
  }

  if (filter === FILTER_PHASE_1) {
    return {
      _and: [
        { status: { _neq: 'Associado' } },
        NO_INVALID_FIELDS,
        {
          _or: [
            { associate_status: { _eq: 'cadastro_criado' } },
            { associate_status: { _eq: '1' } },
            { associate_status: { _null: true } },
            { status: { _eq: 'published' } },
          ],
        },
      ],
    };
  }

  if (filter === FILTER_PHASE_2) {
    return {
      _and: [
        { status: { _neq: 'Associado' } },
        NO_INVALID_FIELDS,
        {
          _or: [
            { associate_status: { _eq: 'dados_pessoais' } },
            { associate_status: { _eq: '2' } },
            { status: { _eq: 'registered' } },
          ],
        },
      ],
    };
  }

  if (filter === FILTER_PHASE_3) {
    return {
      _and: [
        { status: { _neq: 'Associado' } },
        NO_INVALID_FIELDS,
        {
          _or: [
            { associate_status: { _eq: 'documentos' } },
            { associate_status: { _eq: '3' } },
          ],
        },
      ],
    };
  }

  if (filter === FILTER_PHASE_4) {
    return {
      _and: [
        { status: { _neq: 'Associado' } },
        NO_INVALID_FIELDS,
        {
          _or: [
            { associate_status: { _eq: 'assinatura_termo' } },
            { associate_status: { _eq: '4' } },
            { associate_status: { _eq: '5' } },
            { status: { _eq: 'proofs' } },
          ],
        },
      ],
    };
  }

  if (filter === FILTER_INVALID) {
    return {
      _and: [
        { status: { _neq: 'Associado' } },
        { invalid_fields: { _nnull: true } },
        { invalid_fields: { _neq: '[]' } },
        { invalid_fields: { _neq: '{}' } },
        { invalid_fields: { _neq: '' } },
      ],
    };
  }

  return null;
}

/** Query string paginada para listagem do cadastramento. */
export function buildAssociatesListQuery({ page = 1, pageSize = 30, search = '', statusFilter = '' } = {}) {
  const and = [{ status: { _neq: 'patient' } }];
  const statusNode = statusFilterToApiNode(statusFilter);
  if (statusNode) and.push(statusNode);

  const params = new URLSearchParams();
  params.set('limit', String(pageSize));
  params.set('page', String(page));
  params.set('sort', '-created_date');
  params.set('patients', '1');
  params.set('meta', 'filter_count');
  params.set('filter', JSON.stringify({ _and: and }));
  const q = String(search || '').trim();
  if (q) params.set('search', q);
  return params.toString();
}

export function formatCreated(user) {
  const v = user?.created_date || user?.date_created;
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return String(v);
  }
}

/** Exibe telefone no formato BR sem DDI (+55): (11) 98765-4321 */
export function formatPhoneBr(phone) {
  if (!phone) return '—';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return String(phone);
}

export function parseAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
