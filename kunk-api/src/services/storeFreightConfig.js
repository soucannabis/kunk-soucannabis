'use strict';

const systemConfigService = require('./systemConfigService');
const { AppError } = require('../utils/response');
const { env } = require('../config/env');

function parseJson(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function asBool(raw, fallback = false) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

async function resolveMap(system) {
  const { values } = await systemConfigService.resolveAll(system);
  return values || {};
}

function getCfg(map, key) {
  return map[key] ?? map[`store.${key}`] ?? null;
}

async function getStoreFreightConfig() {
  const map = await resolveMap('store');
  return {
    apply_to_total: asBool(map['store.freight.apply_to_total'], true),
    ship_from: parseJson(map['store.ship_from'], null),
    package: parseJson(map['store.freight.package'], null),
    label_package: parseJson(map['store.freight.label_package'], null),
    content_declaration: parseJson(map['store.freight.content_declaration'], null),
    default_option: parseJson(map['store.freight.default_option'], null),
    loggi_external_service_ids: parseJson(map['store.freight.loggi.external_service_ids'], null),
    melhorenvio_enabled_service_ids: parseJson(
      map['store.freight.melhorenvio.enabled_service_ids'],
      null
    ),
  };
}

async function getModuleFreightFlags() {
  const { isModuleEnabled } = require('./moduleFlags');
  const map = await resolveMap('modules');
  return {
    loggi: {
      enabled: await isModuleEnabled('loggi'),
      use_for_quote: asBool(map['modules.loggi.use_for_quote'], false),
      use_for_label: asBool(map['modules.loggi.use_for_label'], false),
      use_for_tracking: asBool(map['modules.loggi.use_for_tracking'], false),
    },
    melhorenvio: {
      enabled: await isModuleEnabled('melhorenvio'),
      use_for_quote: asBool(map['modules.melhorenvio.use_for_quote'], false),
      use_for_label: asBool(map['modules.melhorenvio.use_for_label'], false),
      use_for_tracking: asBool(map['modules.melhorenvio.use_for_tracking'], false),
    },
    label_provider: map['modules.freight.label_provider'] || 'loggi',
  };
}

function assertShipFrom(shipFrom) {
  if (!shipFrom || typeof shipFrom !== 'object') {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'store.ship_from não configurado', {
      missing: ['store.ship_from'],
    });
  }
  const required = [
    'name',
    'street',
    'number',
    'neighborhood',
    'city',
    'state',
    'cep',
    'phone',
    'document',
  ];
  const missing = required.filter((k) => {
    if (k === 'phone') {
      return !String(shipFrom.phone || shipFrom.phoneNumber || '').replace(/\D/g, '');
    }
    if (k === 'document') {
      return !String(
        shipFrom.document || shipFrom.federalTaxId || shipFrom.cnpj || shipFrom.cpf || ''
      ).replace(/\D/g, '');
    }
    return !String(shipFrom[k] || '').trim();
  });
  if (missing.length) {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'store.ship_from incompleto', {
      missing: missing.map((k) => `store.ship_from.${k}`),
    });
  }
}

/** Alias — remetente completo (exceto complemento) é obrigatório para cotação e etiqueta. */
function assertShipFromForLabel(shipFrom) {
  assertShipFrom(shipFrom);
}

function assertPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'store.freight.package não configurado', {
      missing: ['store.freight.package'],
    });
  }
  const required = ['weight_g', 'length_cm', 'width_cm', 'height_cm'];
  // also accept camelCase from admin
  const get = (snake, camel) => pkg[snake] ?? pkg[camel];
  const missing = [];
  if (!(Number(get('weight_g', 'weightG')) > 0)) missing.push('weight_g');
  if (!(Number(get('length_cm', 'lengthCm')) > 0)) missing.push('length_cm');
  if (!(Number(get('width_cm', 'widthCm')) > 0)) missing.push('width_cm');
  if (!(Number(get('height_cm', 'heightCm')) > 0)) missing.push('height_cm');
  if (missing.length) {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'store.freight.package incompleto', {
      missing: missing.map((k) => `store.freight.package.${k}`),
    });
  }
}

function assertContentDeclaration(decl) {
  if (!decl || typeof decl !== 'object') {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'store.freight.content_declaration não configurado', {
      missing: ['store.freight.content_declaration'],
    });
  }
  const description = String(decl.description || '').trim();
  const totalValue = Number(decl.total_value ?? decl.totalValue);
  if (!description || !(totalValue > 0)) {
    throw new AppError(400, 'CONFIG_INCOMPLETE', 'Declaração de conteúdo incompleta', {
      missing: ['description', 'total_value'],
    });
  }
}

function normalizePackage(pkg) {
  if (!pkg) return null;
  return {
    weightG: Number(pkg.weight_g ?? pkg.weightG),
    lengthCm: Number(pkg.length_cm ?? pkg.lengthCm),
    widthCm: Number(pkg.width_cm ?? pkg.widthCm),
    heightCm: Number(pkg.height_cm ?? pkg.heightCm),
  };
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

/** Telefone Loggi: DDI 55 + DDD + número (legado). */
function toLoggiPhone(phone) {
  let d = onlyDigits(phone);
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

/**
 * SISUs homologados (Sales Engineering Loggi).
 * Preferência: system_configs → LOGGI_EXTERNAL_SERVICE_IDS (csv).
 */
function resolveLoggiExternalServiceIds(cfg) {
  const fromCfg = Array.isArray(cfg?.loggi_external_service_ids)
    ? cfg.loggi_external_service_ids
    : [];
  const cleaned = fromCfg.map((s) => String(s || '').trim()).filter(Boolean);
  if (cleaned.length) return cleaned;
  return String(process.env.LOGGI_EXTERNAL_SERVICE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickLoggiExternalServiceId(...candidates) {
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return null;
}

function buildLoggiLineAddress(addr) {
  const line1 = [addr.street, addr.number || addr.street_number, addr.neighborhood]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' - ');
  return {
    addressLine1: line1,
    addressLine2: String(addr.complement || '').trim(),
    postalCode: onlyDigits(addr.cep || addr.postal_code),
    city: String(addr.city || '').trim(),
    state: String(addr.state || '').trim(),
    country: 'Brasil',
  };
}

/** Formato Loggi para cotação (`/quotations`) — só `lines`. */
function shipFromToLoggi(shipFrom) {
  return { lines: buildLoggiLineAddress(shipFrom || {}) };
}

function addressToShipTo(address) {
  return { lines: buildLoggiLineAddress(address || {}) };
}

/**
 * Formato Loggi para etiqueta (`/async-shipments`).
 * Exige name, phoneNumber, federalTaxId e address.lineAddress.
 */
function personToLoggiShipment({
  name,
  phone,
  document,
  email,
  address,
  instructions = '',
}) {
  return {
    name: String(name || '').trim() || 'Destinatário',
    phoneNumber: toLoggiPhone(phone),
    federalTaxId: onlyDigits(document),
    ...(email ? { email: String(email).trim() } : {}),
    address: {
      instructions: String(instructions || '').trim() || undefined,
      lineAddress: buildLoggiLineAddress(address || {}),
    },
  };
}

function shipFromToLoggiShipment(shipFrom) {
  return personToLoggiShipment({
    name: shipFrom.name || shipFrom.company_name,
    phone: shipFrom.phone || shipFrom.phoneNumber,
    document: shipFrom.document || shipFrom.federalTaxId || shipFrom.cnpj || shipFrom.cpf,
    email: shipFrom.email,
    address: shipFrom,
    instructions: shipFrom.instructions || 'Remetente',
  });
}

module.exports = {
  getStoreFreightConfig,
  getModuleFreightFlags,
  assertShipFrom,
  assertShipFromForLabel,
  assertPackage,
  assertContentDeclaration,
  normalizePackage,
  shipFromToLoggi,
  addressToShipTo,
  personToLoggiShipment,
  shipFromToLoggiShipment,
  buildLoggiLineAddress,
  resolveLoggiExternalServiceIds,
  pickLoggiExternalServiceId,
  toLoggiPhone,
  parseJson,
  asBool,
};
