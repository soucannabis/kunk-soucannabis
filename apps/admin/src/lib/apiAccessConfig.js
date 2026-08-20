import {
  API_ACCESS_CONFIG_KEY,
  API_ACCESS_CONFIG_SYSTEM,
  API_ACCESS_DEFAULTS,
  parseEnvBool,
} from '@kunk/config';

const KEY_META = {
  description: 'Habilita autenticação Bearer e gestão de tokens de API no Admin',
  value_type: 'boolean',
};

/**
 * Load API access feature flag from system_configs (system=api).
 */
export async function loadApiAccess(api) {
  const values = { ...API_ACCESS_DEFAULTS };
  const itemsByKey = {};

  try {
    const res = await api.configBySystem(API_ACCESS_CONFIG_SYSTEM);
    const items = res.data?.items || [];
    for (const item of items) {
      itemsByKey[item.key] = item;
      if (item.key === API_ACCESS_CONFIG_KEY) {
        values.enabled = parseEnvBool(item.value, API_ACCESS_DEFAULTS.enabled);
      }
    }
  } catch {
    /* keep defaults */
  }

  return { values, itemsByKey };
}

/**
 * Persist API access enabled flag.
 */
export async function saveApiAccess(api, nextValues, baselineValues, itemsByKey) {
  const updatedItems = { ...itemsByKey };
  const next = parseEnvBool(nextValues.enabled, false) ? 'true' : 'false';
  const prev = parseEnvBool(baselineValues.enabled, false) ? 'true' : 'false';
  const existing = updatedItems[API_ACCESS_CONFIG_KEY];

  if (existing?.id && next === prev) return updatedItems;

  const hardcoded = API_ACCESS_DEFAULTS.enabled ? 'true' : 'false';

  if (existing?.id) {
    const res = await api.updateConfig(existing.id, {
      value: next,
      description: KEY_META.description,
      value_type: KEY_META.value_type,
    });
    if (res.data) updatedItems[API_ACCESS_CONFIG_KEY] = res.data;
  } else {
    const res = await api.createConfig({
      system: API_ACCESS_CONFIG_SYSTEM,
      key: API_ACCESS_CONFIG_KEY,
      value: next,
      value_type: KEY_META.value_type,
      description: KEY_META.description,
      allow_hardcoded: true,
      hardcoded_default: hardcoded,
      is_sensitive: false,
    });
    if (res.data) updatedItems[API_ACCESS_CONFIG_KEY] = res.data;
  }

  return updatedItems;
}

/** Build scopes array from collection → { read, write, delete } matrix. */
export function scopesFromMatrix(matrix, collections = Object.keys(matrix || {})) {
  const scopes = [];
  let allSelected = collections.length > 0;
  for (const collection of collections) {
    const actions = matrix?.[collection];
    for (const action of ['read', 'write', 'delete']) {
      if (actions?.[action]) scopes.push(`items:${collection}:${action}`);
      else allSelected = false;
    }
  }
  if (allSelected) return ['*'];
  return scopes;
}

/** Parse scopes into collection → actions matrix. */
export function matrixFromScopes(scopes, collections = []) {
  if ((scopes || []).includes('*')) {
    const matrix = emptyScopeMatrix(collections);
    for (const collection of collections) {
      matrix[collection] = { read: true, write: true, delete: true };
    }
    return matrix;
  }

  const matrix = {};
  for (const scope of scopes || []) {
    const match = /^items:([a-z0-9_]+):(read|write|delete|\*)$/.exec(scope);
    if (!match) continue;
    const [, collection, action] = match;
    if (!matrix[collection]) matrix[collection] = { read: false, write: false, delete: false };
    if (action === '*') {
      matrix[collection].read = true;
      matrix[collection].write = true;
      matrix[collection].delete = true;
    } else {
      matrix[collection][action] = true;
    }
  }
  return matrix;
}

export function emptyScopeMatrix(collections) {
  const matrix = {};
  for (const c of collections) {
    matrix[c] = { read: false, write: false, delete: false };
  }
  return matrix;
}
