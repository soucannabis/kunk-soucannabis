import {
  isBooleanField,
  isDateOnlyField,
  isDateTimeField,
  isUuidCodeField,
} from './fieldWidgets.js';

const SKIP_FILTER_FIELDS = new Set([
  'id',
  'password',
  'account_password',
  'session_token',
  'password_reset_token',
  'utalk_token',
  'token',
  'tags',
  'items',
  'address',
  'details',
  'custom_payment',
  'payment_info',
  'query_config',
  'sql_query',
  'dashboard_queries',
  'layout_positions',
  'chart_config',
  'column_maps',
  'favorites',
  'ciap_codes',
  'preferred_products',
  'invalid_fields',
  'delivery_address',
]);

const SELECT_PREFERRED = new Set([
  'status',
  'associate_status',
  'type',
  'gender',
  'marital_status',
  'payment_method',
  'payment_type',
  'category',
  'unit',
  'state',
  'active',
  'doc_type',
  'doc_kind',
  'side',
  'subject',
  'responsible_type',
]);

export function isFilterableField(name) {
  if (!name || SKIP_FILTER_FIELDS.has(name)) return false;
  if (isUuidCodeField(name)) return false;
  if (/_token$|_password$|_secret$/.test(name)) return false;
  return true;
}

export function getFilterKind(field, sampleValues = []) {
  if (isBooleanField(field)) return 'boolean';
  if (isDateOnlyField(field) || isDateTimeField(field)) return 'date';
  if (SELECT_PREFERRED.has(field)) return 'select';

  const unique = [
    ...new Set(
      (sampleValues || [])
        .filter((v) => v != null && v !== '' && typeof v !== 'object')
        .map((v) => String(v))
    ),
  ];
  if (unique.length > 0 && unique.length <= 24) return 'select';
  return 'text';
}

export function collectFacetOptions(rows, fields) {
  const out = {};
  for (const field of fields || []) {
    const set = new Set();
    for (const row of rows || []) {
      const v = row?.[field];
      if (v == null || v === '' || typeof v === 'object') continue;
      if (typeof v === 'boolean') {
        set.add(v ? 'true' : 'false');
        continue;
      }
      set.add(String(v));
    }
    out[field] = [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  return out;
}

export function mergeFacetOptions(prev, next) {
  const out = { ...(prev || {}) };
  for (const [field, values] of Object.entries(next || {})) {
    const set = new Set([...(out[field] || []), ...(values || [])]);
    out[field] = [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  return out;
}

/** Monta objeto filter da API Kunk a partir dos filtros da UI. */
export function buildApiFilter(filters) {
  const parts = [];
  for (const f of filters || []) {
    if (!f?.field) continue;
    if (f.kind === 'boolean') {
      if (f.value === '' || f.value == null) continue;
      const bool = f.value === true || f.value === 'true';
      parts.push({ [f.field]: { _eq: bool } });
      continue;
    }
    if (f.kind === 'date') {
      const range = [];
      if (f.value) range.push({ [f.field]: { _gte: f.value } });
      if (f.valueTo) {
        const end = String(f.valueTo).includes('T')
          ? f.valueTo
          : `${f.valueTo}T23:59:59.999`;
        range.push({ [f.field]: { _lte: end } });
      }
      if (range.length === 1) parts.push(range[0]);
      else if (range.length > 1) parts.push({ _and: range });
      continue;
    }
    if (f.kind === 'select') {
      if (f.value === '' || f.value == null) continue;
      let eq = f.value;
      if (eq === 'true') eq = true;
      if (eq === 'false') eq = false;
      parts.push({ [f.field]: { _eq: eq } });
      continue;
    }
    if (f.value === '' || f.value == null) continue;
    parts.push({ [f.field]: { _icontains: String(f.value) } });
  }
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return { _and: parts };
}

export function filterSummary(filter, fieldLabelFn) {
  if (!filter?.field) return '';
  const label = fieldLabelFn ? fieldLabelFn(filter.field) : filter.field;
  if (filter.kind === 'boolean') {
    return `${label}: ${filter.value === true || filter.value === 'true' ? 'Sim' : 'Não'}`;
  }
  if (filter.kind === 'date') {
    const from = filter.value || '…';
    const to = filter.valueTo || '…';
    return `${label}: ${from} → ${to}`;
  }
  return `${label}: ${filter.value}`;
}
