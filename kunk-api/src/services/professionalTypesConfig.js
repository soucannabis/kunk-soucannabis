'use strict';

const { query } = require('../db/pool');
const systemConfigService = require('./systemConfigService');
const { AppError } = require('../utils/response');

const SYSTEM = 'services';
const KEY_TYPES = 'professional_types';
const KEY_REPORT = 'report_settings';

const DEFAULT_TYPES = [
  { id: 'medic', label: 'Médico', association_fee: 0, default_consultation_price: null, active: true, sort: 10 },
  { id: 'psychiatrist', label: 'Psiquiatra', association_fee: 0, default_consultation_price: null, active: true, sort: 20 },
  { id: 'psico', label: 'Psicólogo', association_fee: 0, default_consultation_price: null, active: true, sort: 30 },
  { id: 'therapist', label: 'Terapeuta', association_fee: 0, default_consultation_price: null, active: true, sort: 40 },
  { id: 'assist_social', label: 'Assistente Social', association_fee: 0, default_consultation_price: null, active: true, sort: 50 },
  { id: 'physiotherapist', label: 'Fisioterapeuta', association_fee: 0, default_consultation_price: null, active: true, sort: 60 },
  { id: 'dentist', label: 'Dentista', association_fee: 0, default_consultation_price: null, active: true, sort: 70 },
  { id: 'vet', label: 'Veterinário', association_fee: 0, default_consultation_price: null, active: true, sort: 80 },
];

const DEFAULT_REPORT_SETTINGS = { deduct_donation_from_payable: false };

/** Aliases legados → id canônico do catálogo admin. */
const LEGACY_TYPE_ALIASES = {
  physician: 'medic',
  medico: 'medic',
  médico: 'medic',
  doctor: 'medic',
  md: 'medic',
  psiquiatra: 'psychiatrist',
  psychiatry: 'psychiatrist',
  psicologo: 'psico',
  psicólogo: 'psico',
  psychologist: 'psico',
  psycho: 'psico',
  terapeuta: 'therapist',
  therapy: 'therapist',
  assistente_social: 'assist_social',
  'assistente social': 'assist_social',
  social_worker: 'assist_social',
  fisioterapeuta: 'physiotherapist',
  fisio: 'physiotherapist',
  physio: 'physiotherapist',
  dentista: 'dentist',
  odontologia: 'dentist',
  veterinario: 'vet',
  veterinário: 'vet',
  veterinary: 'vet',
};

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeType(row, index = 0) {
  const id = String(row?.id || '').trim();
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Tipo sem id');
  const fee = Number(row.association_fee);
  if (!Number.isFinite(fee) || fee < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `association_fee inválido para ${id}`);
  }
  let defaultPrice = row.default_consultation_price;
  if (defaultPrice === '' || defaultPrice === undefined) defaultPrice = null;
  if (defaultPrice != null) {
    defaultPrice = Number(defaultPrice);
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `default_consultation_price inválido para ${id}`);
    }
  }
  return {
    id,
    label: String(row.label || id).trim() || id,
    association_fee: fee,
    default_consultation_price: defaultPrice,
    active: row.active === false || row.active === 0 || row.active === 'false' ? false : true,
    sort: Number.isFinite(Number(row.sort)) ? Number(row.sort) : (index + 1) * 10,
  };
}

function validateTypes(list) {
  if (!Array.isArray(list)) throw new AppError(400, 'VALIDATION_ERROR', 'professional_types deve ser um array');
  const seen = new Set();
  const normalized = list.map((t, i) => normalizeType(t, i));
  for (const t of normalized) {
    if (seen.has(t.id)) throw new AppError(400, 'VALIDATION_ERROR', `id duplicado: ${t.id}`);
    seen.add(t.id);
  }
  return normalized.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'pt-BR'));
}

function normalizeReportSettings(raw) {
  const obj = parseJson(raw, DEFAULT_REPORT_SETTINGS) || DEFAULT_REPORT_SETTINGS;
  return {
    deduct_donation_from_payable: Boolean(obj.deduct_donation_from_payable),
  };
}

async function readConfigValue(key) {
  const result = await query(
    `SELECT value FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [SYSTEM, key]
  );
  return result.rows[0]?.value;
}

async function upsertConfig(key, value, description) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = await query(
    `SELECT id FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [SYSTEM, key]
  );
  if (existing.rows[0]?.id) {
    await systemConfigService.updateConfig(existing.rows[0].id, { value: serialized });
  } else {
    await systemConfigService.createConfig({
      system: SYSTEM,
      key,
      value: serialized,
      value_type: 'json',
      is_sensitive: false,
      allow_hardcoded: false,
      description,
    });
  }
}

async function loadProfessionalTypes() {
  const raw = await readConfigValue(KEY_TYPES);
  const parsed = parseJson(raw, null);
  if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_TYPES.map((t, i) => normalizeType(t, i));
  try {
    return validateTypes(parsed);
  } catch {
    return DEFAULT_TYPES.map((t, i) => normalizeType(t, i));
  }
}

async function saveProfessionalTypes(list) {
  const normalized = validateTypes(list);
  await upsertConfig(KEY_TYPES, normalized, 'Catálogo de tipos de profissional');
  return normalized;
}

async function loadReportSettings() {
  const raw = await readConfigValue(KEY_REPORT);
  return normalizeReportSettings(raw);
}

async function saveReportSettings(body) {
  const normalized = normalizeReportSettings(body);
  await upsertConfig(
    KEY_REPORT,
    normalized,
    'Relatório de serviços: se true, doação desconta do valor a pagar'
  );
  return normalized;
}

function normalizeProfessionalTypeId(typeId) {
  if (typeId == null || typeId === '') return null;
  const raw = String(typeId).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return LEGACY_TYPE_ALIASES[lower] || raw;
}

function typeById(types, typeId) {
  const id = normalizeProfessionalTypeId(typeId);
  if (!id) return null;
  return types.find((t) => t.id === String(id)) || null;
}

/**
 * Garante que o tipo existe no catálogo (ativo, salvo allowInactive).
 * @returns {string} id canônico
 */
async function assertValidProfessionalType(typeId, { allowInactive = false } = {}) {
  const id = normalizeProfessionalTypeId(typeId);
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'type obrigatório');
  const types = await loadProfessionalTypes();
  const cfg = types.find((t) => t.id === id);
  if (!cfg) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `type inválido: "${typeId}". Use um id do catálogo em Configurações → Tipos de serviços.`
    );
  }
  if (!allowInactive && cfg.active === false) {
    throw new AppError(400, 'VALIDATION_ERROR', `type inativo: ${id}`);
  }
  return id;
}

/**
 * explicitPrice wins; else type.default_consultation_price (anula profissional);
 * else professional.consultation_price; else 0.
 */
function resolveConsultationPrice(professional, explicitPrice, typeOrConfig) {
  if (explicitPrice != null && explicitPrice !== '') return Number(explicitPrice) || 0;

  const typeConfig =
    typeOrConfig && typeof typeOrConfig === 'object' && 'association_fee' in typeOrConfig
      ? typeOrConfig
      : null;

  if (typeConfig && typeConfig.default_consultation_price != null) {
    return Number(typeConfig.default_consultation_price) || 0;
  }

  if (professional?.consultation_price != null && professional.consultation_price !== '') {
    return Number(professional.consultation_price) || 0;
  }
  return 0;
}

async function resolveConsultationPriceAsync(professional, explicitPrice, typeId) {
  if (explicitPrice != null && explicitPrice !== '') return Number(explicitPrice) || 0;
  const types = await loadProfessionalTypes();
  const cfg = typeById(types, typeId || professional?.type);
  return resolveConsultationPrice(professional, null, cfg || { id: typeId, association_fee: 0 });
}

function resolvePayable(service, typeConfig, reportSettings) {
  const price = Number(service?.price) || 0;
  const fee = Number(typeConfig?.association_fee) || 0;
  let payable = price - fee;
  const deduct = Boolean(reportSettings?.deduct_donation_from_payable);
  if (deduct) {
    payable -= Number(service?.donation) || 0;
  }
  if (payable < 0) payable = 0;
  return {
    association_fee: fee,
    deduct_donation: deduct,
    payable,
  };
}

module.exports = {
  SYSTEM,
  KEY_TYPES,
  KEY_REPORT,
  DEFAULT_TYPES,
  DEFAULT_REPORT_SETTINGS,
  LEGACY_TYPE_ALIASES,
  loadProfessionalTypes,
  saveProfessionalTypes,
  loadReportSettings,
  saveReportSettings,
  normalizeProfessionalTypeId,
  assertValidProfessionalType,
  typeById,
  resolveConsultationPrice,
  resolveConsultationPriceAsync,
  resolvePayable,
  validateTypes,
  normalizeReportSettings,
};
