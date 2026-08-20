import { collectionLabel } from './collectionLabels.js';
import { fieldLabel } from './fieldLabels.js';

export const ADMIN_CONFIG_SYSTEM = 'admin';

export function visibleFieldsConfigKey(collection) {
  return `dados.visible_fields.${collection}`;
}

export function parseVisibleFieldsKey(key) {
  const prefix = 'dados.visible_fields.';
  if (!key || !String(key).startsWith(prefix)) return null;
  return String(key).slice(prefix.length);
}

export function parseFieldsJson(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(String).filter(Boolean);
  } catch {
    return null;
  }
}

export function formatFieldsForDisplay(fields) {
  if (!fields?.length) return '—';
  return fields.map((f) => fieldLabel(f)).join(', ');
}

export function defaultVisibleFields(schema) {
  if (!schema) return ['id'];
  const skip = new Set([...(schema.sensitive || []), 'is_sample']);
  const cols = (schema.columns || []).filter((c) => !skip.has(c));
  return cols.slice(0, 6);
}

export function availableFields(schema) {
  if (!schema) return [];
  const skip = new Set(schema.sensitive || []);
  return (schema.columns || []).filter((c) => !skip.has(c));
}

/**
 * Load visible fields for a collection from system_configs (system=admin).
 */
export async function loadVisibleFields(api, collection, schema) {
  try {
    const res = await api.configBySystem(ADMIN_CONFIG_SYSTEM);
    const key = visibleFieldsConfigKey(collection);
    const item = (res.data?.items || []).find((row) => row.key === key);
    const parsed = parseFieldsJson(item?.value || item?.resolved_value);
    if (parsed?.length) {
      const allowed = new Set(availableFields(schema));
      const filtered = parsed.filter((f) => allowed.has(f));
      if (filtered.length) return { fields: filtered, configItem: item || null };
    }
    return { fields: defaultVisibleFields(schema), configItem: item || null };
  } catch {
    return { fields: defaultVisibleFields(schema), configItem: null };
  }
}

/**
 * Persist visible fields for a collection.
 */
export async function saveVisibleFields(api, collection, fields, existingItem = null) {
  const key = visibleFieldsConfigKey(collection);
  const value = JSON.stringify(fields);
  const description = `Campos visíveis na tabela Dados · ${collectionLabel(collection)}`;

  if (existingItem?.id) {
    return api.updateConfig(existingItem.id, { value, description, value_type: 'json' });
  }

  // Try find again in case it was created elsewhere
  try {
    const res = await api.configBySystem(ADMIN_CONFIG_SYSTEM);
    const found = (res.data?.items || []).find((row) => row.key === key);
    if (found?.id) {
      return api.updateConfig(found.id, { value, description, value_type: 'json' });
    }
  } catch {
    /* create below */
  }

  return api.createConfig({
    system: ADMIN_CONFIG_SYSTEM,
    key,
    value,
    value_type: 'json',
    description,
    allow_hardcoded: true,
    hardcoded_default: JSON.stringify(defaultVisibleFields({ columns: fields, sensitive: [] })),
  });
}
