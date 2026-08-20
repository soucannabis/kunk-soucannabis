/** Heurísticas de widget por nome de campo (schema Admin não expõe tipos SQL). */

const PHONE_FIELDS = new Set([
  'mobile_number',
  'phone',
  'company_phone',
  'representative_mobile',
]);

const DATE_ONLY_FIELDS = new Set([
  'birth_date',
  'associate_birth_date',
  'date_prescription',
]);

const DATETIME_FIELDS = new Set([
  'payment_date',
  'consultation_date',
  'tracking_code_date',
  'last_tracking_date',
  'session_expires',
  'password_reset_expires',
  'last_activity',
  'date_created',
  'date_updated',
]);

export function isPhoneField(name) {
  return PHONE_FIELDS.has(name) || /(?:^|_)(?:phone|mobile)(?:_|$)/i.test(name || '');
}

export function isDateOnlyField(name) {
  return DATE_ONLY_FIELDS.has(name);
}

export function isDateTimeField(name) {
  if (DATETIME_FIELDS.has(name)) return true;
  if (isDateOnlyField(name)) return false;
  return /(?:^|_)date(?:_|$)/i.test(name || '') || /_at$/i.test(name || '');
}

/** Coluna `tags` em registros (não a collection `tags`). */
export function isRecordTagsField(collection, name) {
  return name === 'tags' && collection !== 'tags';
}

/** Códigos de negócio que não são UUID de identidade (podem continuar editáveis). */
const NON_UUID_CODE_FIELDS = new Set([
  'tracking_code',
  'payment_code',
  'carrier_order_code',
  'sku',
  'internal_code',
  'ciap_codes',
  'embedded_report_codes',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value) {
  if (value == null || value === '') return false;
  return UUID_RE.test(String(value).trim());
}

/**
 * Campos de código UUID de identidade (user_code, service_code, …).
 * Não editáveis no Admin — gerados pelo sistema.
 */
export function isUuidCodeField(name, value) {
  if (!name || name === 'id' || NON_UUID_CODE_FIELDS.has(name)) return false;
  const isCodeName =
    name === 'code' ||
    /_code$/.test(name) ||
    /_user_code$/.test(name);
  if (isCodeName) return true;
  // Campos com valor UUID e nome de referência (ex.: fingerprint, event_id)
  if (looksLikeUuid(value) && /(?:code|uuid|fingerprint)$/i.test(name)) return true;
  return false;
}

const BOOLEAN_NAME_FIELDS = new Set([
  'active',
  'is_sample',
  'is_company',
  'is_session_active',
  'is_associate',
  'is_prescriber',
  'is_collaborator',
  'is_sensitive',
  'is_required',
  'is_secret',
  'allow_hardcoded',
  'requires_patient',
  'last_test_ok',
]);

export function isBooleanField(name, value) {
  if (typeof value === 'boolean') return true;
  if (value === 'true' || value === 'false') return true;
  if (value === 0 || value === 1) {
    if (name === 'active' || /^is_/.test(name || '')) return true;
  }
  if (BOOLEAN_NAME_FIELDS.has(name) || /^is_/.test(name || '')) return true;
  return false;
}

/** Normaliza para boolean puro (ou null se indefinido). */
export function toBooleanValue(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

/** Detecta string ISO date/datetime. */
export function looksLikeDateValue(value) {
  if (value == null || value === '') return false;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return true;
  return false;
}

/**
 * Formata data/hora no padrão brasileiro (pt-BR).
 * Datas só-dia (YYYY-MM-DD) usam parse local para evitar deslocamento de fuso.
 */
export function formatDateBr(value, { dateOnly } = {}) {
  if (value == null || value === '') return '—';
  const s = String(value).trim();
  const onlyDay =
    dateOnly === true ||
    (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !/[T ]\d{2}:\d{2}/.test(s) && s.length <= 10);

  if (onlyDay) {
    const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }

  const d = value instanceof Date ? value : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  if (dateOnly === true || onlyDay) {
    return d.toLocaleDateString('pt-BR');
  }
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatListCell(value, fieldName) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    const tags = value
      .map((t) => (typeof t === 'string' ? t : t?.tag || t?.name || ''))
      .filter(Boolean);
    if (tags.length) return tags.join(', ');
  }
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const b = toBooleanValue(value);
    if (b === true) return 'Sim';
    if (b === false) return 'Não';
  }
  if (
    isDateOnlyField(fieldName) ||
    isDateTimeField(fieldName) ||
    looksLikeDateValue(value)
  ) {
    return formatDateBr(value, { dateOnly: isDateOnlyField(fieldName) });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toDateInputValue(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function toDateTimeLocalValue(value) {
  if (value == null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

/** Normaliza tags do registro para array de strings (labels). */
export function normalizeTagLabels(value) {
  if (value == null || value === '') return [];
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return raw.trim() ? [raw.trim()] : [];
    }
  }
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const labels = raw.labels || raw.tags;
    if (Array.isArray(labels)) return normalizeTagLabels(labels);
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (typeof t === 'string') return t.trim();
      if (t && typeof t === 'object') return String(t.tag || t.name || t.label || '').trim();
      return '';
    })
    .filter(Boolean);
}

/**
 * Serializa labels para o formato esperado no PATCH.
 * Preserva wrapper `{ labels, custom_fields }` da triagem quando existir.
 */
export function serializeTagLabels(labels, previous) {
  const clean = (labels || []).map((t) => String(t).trim()).filter(Boolean);
  if (previous && !Array.isArray(previous) && typeof previous === 'object' && previous.custom_fields) {
    return { ...previous, labels: clean };
  }
  if (Array.isArray(previous) && previous.some((t) => t && typeof t === 'object' && t.tag != null)) {
    return clean.map((tag) => ({ tag }));
  }
  return clean;
}

const FULL_NAME_FIELDS = new Set(['full_name', 'fullname']);

const NAME_PAIR_CANDIDATES = [
  { first: 'name', last: 'last_name' },
  { first: 'associate_name', last: 'associate_last_name' },
  { first: 'representative_name', last: 'representative_last_name' },
  { first: 'first_name', last: 'last_name' },
];

export function isFullNameField(name) {
  return FULL_NAME_FIELDS.has(name);
}

/** Par nome/sobrenome presente nas colunas (exige os dois). */
export function resolveNamePair(columns) {
  const set = new Set(columns || []);
  for (const pair of NAME_PAIR_CANDIDATES) {
    if (set.has(pair.first) && set.has(pair.last)) return pair;
  }
  return null;
}

export function composeFullName(first, last) {
  return [first, last]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Garante full_name/fullname = nome + sobrenome quando o par e o campo completo existem.
 */
export function withSyncedFullName(form, columns) {
  const cols = columns || Object.keys(form || {});
  const pair = resolveNamePair(cols);
  if (!pair) return form;
  const fullKeys = cols.filter((c) => isFullNameField(c));
  if (!fullKeys.length) return form;
  const full = composeFullName(form?.[pair.first], form?.[pair.last]);
  const next = { ...form };
  for (const key of fullKeys) next[key] = full || null;
  return next;
}

export function isNamePartField(name, columns) {
  const pair = resolveNamePair(columns);
  if (!pair) return false;
  return name === pair.first || name === pair.last;
}

