export const STORE_FREIGHT_KEYS = {
  applyToTotal: 'store.freight.apply_to_total',
  shipFrom: 'store.ship_from',
  package: 'store.freight.package',
  labelPackage: 'store.freight.label_package',
  contentDeclaration: 'store.freight.content_declaration',
  defaultOption: 'store.freight.default_option',
  loggiExternalServiceIds: 'store.freight.loggi.external_service_ids',
  melhorenvioEnabledServiceIds: 'store.freight.melhorenvio.enabled_service_ids',
};

export function getStoreFreightDefaults() {
  return {
    applyToTotal: true,
    shipFrom: {
      street: '',
      number: '',
      neighborhood: '',
      complement: '',
      city: '',
      state: '',
      cep: '',
      name: '',
      phone: '',
      document: '',
    },
    package: {
      weight_g: '',
      length_cm: '',
      width_cm: '',
      height_cm: '',
    },
    labelPackage: null,
    contentDeclaration: {
      description: '',
      total_value: '',
    },
    defaultOption: null,
    loggiExternalServiceIds: [],
    melhorenvioEnabledServiceIds: null,
  };
}

function parseMaybe(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function asBool(raw, fallback = true) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

export function mergeStoreFreightFromApi(rawValues = {}) {
  const defaults = getStoreFreightDefaults();
  const ship = parseMaybe(rawValues[STORE_FREIGHT_KEYS.shipFrom]) || defaults.shipFrom;
  const pkg = parseMaybe(rawValues[STORE_FREIGHT_KEYS.package]) || defaults.package;
  const labelPkg = parseMaybe(rawValues[STORE_FREIGHT_KEYS.labelPackage]);
  const decl =
    parseMaybe(rawValues[STORE_FREIGHT_KEYS.contentDeclaration]) || defaults.contentDeclaration;
  const defaultOption = parseMaybe(rawValues[STORE_FREIGHT_KEYS.defaultOption]);
  const loggiIds = parseMaybe(rawValues[STORE_FREIGHT_KEYS.loggiExternalServiceIds]);
  const meIds = parseMaybe(rawValues[STORE_FREIGHT_KEYS.melhorenvioEnabledServiceIds]);

  return {
    applyToTotal: asBool(rawValues[STORE_FREIGHT_KEYS.applyToTotal], true),
    shipFrom: { ...defaults.shipFrom, ...ship },
    package: { ...defaults.package, ...pkg },
    labelPackage: labelPkg,
    contentDeclaration: { ...defaults.contentDeclaration, ...decl },
    defaultOption,
    loggiExternalServiceIds: Array.isArray(loggiIds) ? loggiIds : [],
    melhorenvioEnabledServiceIds: meIds,
  };
}
