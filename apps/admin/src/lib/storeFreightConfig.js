import {
  STORE_FREIGHT_KEYS,
  getStoreFreightDefaults,
  mergeStoreFreightFromApi,
} from './storeFreightDefaults.js';

export const STORE_CONFIG_SYSTEM = 'store';

const KEY_META = {
  [STORE_FREIGHT_KEYS.applyToTotal]: {
    value_type: 'boolean',
    description: 'Aplicar valor do frete no total do carrinho',
    serialize: (v) => (v ? 'true' : 'false'),
  },
  [STORE_FREIGHT_KEYS.shipFrom]: {
    value_type: 'json',
    description: 'Remetente / quem envia os pedidos',
    serialize: (v) => JSON.stringify(v ?? null),
  },
  [STORE_FREIGHT_KEYS.package]: {
    value_type: 'json',
    description: 'Dimensões e peso da caixa',
    serialize: (v) => JSON.stringify(v ?? null),
  },
  [STORE_FREIGHT_KEYS.labelPackage]: {
    value_type: 'json',
    description: 'Override opcional de dims/peso na etiqueta',
    serialize: (v) => (v ? JSON.stringify(v) : ''),
  },
  [STORE_FREIGHT_KEYS.contentDeclaration]: {
    value_type: 'json',
    description: 'Declaração de conteúdo compartilhada',
    serialize: (v) => JSON.stringify(v ?? null),
  },
  [STORE_FREIGHT_KEYS.defaultOption]: {
    value_type: 'json',
    description: 'Favorito de entrega',
    serialize: (v) => (v ? JSON.stringify(v) : ''),
  },
  [STORE_FREIGHT_KEYS.loggiExternalServiceIds]: {
    value_type: 'json',
    description: 'SISUs Loggi',
    serialize: (v) => JSON.stringify(v ?? []),
  },
  [STORE_FREIGHT_KEYS.melhorenvioEnabledServiceIds]: {
    value_type: 'json',
    description: 'IDs de serviço Melhor Envio',
    serialize: (v) => (v == null ? '' : JSON.stringify(v)),
  },
};

const VALUE_PROPS = {
  [STORE_FREIGHT_KEYS.applyToTotal]: 'applyToTotal',
  [STORE_FREIGHT_KEYS.shipFrom]: 'shipFrom',
  [STORE_FREIGHT_KEYS.package]: 'package',
  [STORE_FREIGHT_KEYS.labelPackage]: 'labelPackage',
  [STORE_FREIGHT_KEYS.contentDeclaration]: 'contentDeclaration',
  [STORE_FREIGHT_KEYS.defaultOption]: 'defaultOption',
  [STORE_FREIGHT_KEYS.loggiExternalServiceIds]: 'loggiExternalServiceIds',
  [STORE_FREIGHT_KEYS.melhorenvioEnabledServiceIds]: 'melhorenvioEnabledServiceIds',
};

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isStoreFreightIncomplete(values) {
  const ship = values?.shipFrom || {};
  const pkg = values?.package || {};
  const decl = values?.contentDeclaration || {};
  const shipRequired = ['name', 'street', 'number', 'neighborhood', 'city', 'state', 'cep', 'phone', 'document'];
  const shipOk = shipRequired.every((k) => String(ship[k] || '').trim());
  const pkgOk =
    Number(pkg.weight_g) > 0 &&
    Number(pkg.length_cm) > 0 &&
    Number(pkg.width_cm) > 0 &&
    Number(pkg.height_cm) > 0;
  const declOk = String(decl.description || '').trim() && Number(decl.total_value) > 0;
  return !shipOk || !pkgOk || !declOk;
}

/** @returns {{ incomplete: boolean, missing: string[] }} */
export function getStoreFreightGaps(values) {
  const ship = values?.shipFrom || {};
  const pkg = values?.package || {};
  const decl = values?.contentDeclaration || {};
  const missing = [];
  const shipRequired = ['name', 'street', 'number', 'neighborhood', 'city', 'state', 'cep', 'phone', 'document'];
  if (!shipRequired.every((k) => String(ship[k] || '').trim())) {
    missing.push('remetente (dados de envio)');
  }
  if (
    !(
      Number(pkg.weight_g) > 0 &&
      Number(pkg.length_cm) > 0 &&
      Number(pkg.width_cm) > 0 &&
      Number(pkg.height_cm) > 0
    )
  ) {
    missing.push('caixa / dimensões');
  }
  if (!(String(decl.description || '').trim() && Number(decl.total_value) > 0)) {
    missing.push('declaração de conteúdo');
  }
  return { incomplete: missing.length > 0, missing };
}

export async function loadStoreFreightConfig(api) {
  const defaults = getStoreFreightDefaults();
  const itemsByKey = {};
  const rawValues = {};

  try {
    const res = await api.configBySystem(STORE_CONFIG_SYSTEM);
    const items = res.data?.items || [];
    for (const item of items) {
      itemsByKey[item.key] = item;
      const raw = item.value ?? item.resolved_value ?? item.hardcoded_default;
      if (raw === undefined || raw === null || raw === '') continue;
      rawValues[item.key] = raw;
    }
  } catch {
    /* keep defaults */
  }

  return {
    values: mergeStoreFreightFromApi(rawValues),
    itemsByKey,
    defaults,
  };
}

export async function saveStoreFreightConfig(api, nextValues, baselineValues, itemsByKey) {
  const updatedItems = { ...itemsByKey };

  for (const [key, prop] of Object.entries(VALUE_PROPS)) {
    const next = nextValues[prop];
    const prev = baselineValues[prop];
    if (valuesEqual(next, prev)) continue;

    const meta = KEY_META[key];
    const serialized = meta.serialize(next);
    const existing = updatedItems[key];

    if (existing?.id) {
      const res = await api.updateConfig(existing.id, {
        value: serialized || null,
        description: meta.description,
        value_type: meta.value_type,
      });
      if (res.data) updatedItems[key] = res.data;
    } else {
      const res = await api.createConfig({
        system: STORE_CONFIG_SYSTEM,
        key,
        value: serialized || null,
        value_type: meta.value_type,
        description: meta.description,
        is_sensitive: false,
        is_required: key !== STORE_FREIGHT_KEYS.labelPackage && key !== STORE_FREIGHT_KEYS.defaultOption,
        allow_hardcoded: false,
      });
      if (res.data) updatedItems[key] = res.data;
    }
  }

  return updatedItems;
}

export { STORE_FREIGHT_KEYS, getStoreFreightDefaults, mergeStoreFreightFromApi };
