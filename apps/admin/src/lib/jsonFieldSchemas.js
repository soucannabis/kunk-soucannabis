/** Schemas conhecidos de campos JSONB objeto (sem edição de JSON bruto). */

export const ADDRESS_KEYS = [
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'cep',
  'country',
];

const JSON_OBJECT_SCHEMAS = {
  address: ADDRESS_KEYS,
  delivery_address: ADDRESS_KEYS,
  custom_payment: ['method', 'installments', 'gateway'],
  freight_option: ['provider', 'option_key', 'service_label', 'price'],
  payment_info: ['demo', 'gateway', 'paid'],
};

/** Campos JSONB que são arrays (exceto tags) — só leitura, sem JSON editável. */
const JSON_ARRAY_FIELDS = new Set([
  'items',
  'contest_reports',
  'favorites',
  'embedded_report_codes',
  'dashboard_queries',
  'layout_positions',
  'column_maps',
  'ciap_codes',
  'preferred_products',
  'invalid_fields',
  'read_by',
]);

const JSON_COMPLEX_READONLY = new Set([
  'query_config',
  'sql_query',
  'chart_config',
  'annotations',
  'dce',
  'external_payment_info',
  'meta',
  'metadata',
  'variables',
  'content_json',
  'draft_content_json',
]);

export function isJsonObjectField(name, value) {
  if (JSON_ARRAY_FIELDS.has(name) || JSON_COMPLEX_READONLY.has(name)) return false;
  if (name in JSON_OBJECT_SCHEMAS) return true;
  if (value != null && typeof value === 'object' && !Array.isArray(value)) return true;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('{') && t.endsWith('}')) {
      try {
        const parsed = JSON.parse(t);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function isJsonArrayReadonlyField(name, value) {
  if (JSON_ARRAY_FIELDS.has(name)) return true;
  if (JSON_COMPLEX_READONLY.has(name)) return true;
  if (Array.isArray(value) && name !== 'tags') return true;
  return false;
}

export function parseJsonObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...parsed };
    } catch {
      return {};
    }
  }
  return {};
}

/** Chaves do formulário agrupado: schema conhecido ∪ chaves existentes no valor. */
export function jsonObjectKeys(name, value) {
  const schemaKeys = JSON_OBJECT_SCHEMAS[name] || [];
  const current = parseJsonObject(value);
  const fromValue = Object.keys(current);
  const keys = [...schemaKeys];
  for (const k of fromValue) {
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.length ? keys : schemaKeys.length ? schemaKeys : fromValue;
}

export function emptyJsonObject(name) {
  const keys = JSON_OBJECT_SCHEMAS[name] || [];
  const out = {};
  for (const k of keys) out[k] = '';
  return out;
}
