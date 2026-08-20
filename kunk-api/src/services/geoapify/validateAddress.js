'use strict';

const { geocodeSearch } = require('./client');
const { fetchViaCepReport } = require('./viacep');
const { evaluateCompositeWithViaCep } = require('./composite');
const itemsRepository = require('../../repositories/itemsRepository');
const systemConfigService = require('../systemConfigService');
const { AppError } = require('../../utils/response');
const { env } = require('../../config/env');

function asBool(raw, fallback = false) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

function normalizeAddressBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw.trim());
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** street - number - neighborhood - city - state - cep (sem complemento). */
function formatAddressText(address) {
  if (!address || typeof address !== 'object') return '';
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
    address.cep,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function hasStructuredAddress(address) {
  if (!address || typeof address !== 'object') return false;
  return Boolean(String(address.street || '').trim() && String(address.cep || '').replace(/\D/g, ''));
}

async function isValidationEnabled() {
  const { isModuleEnabled } = require('../moduleFlags');
  if (!(await isModuleEnabled('geoapify'))) return false;
  const { values } = await systemConfigService.resolveAll('modules');
  return asBool(values['modules.geoapify.use_for_validation'], false);
}

async function getValidationStatus() {
  const { isModuleEnabled } = require('../moduleFlags');
  const credentialsService = require('../credentialsService');
  const credentials = await credentialsService.listPublic('geoapify');
  const apiKey = credentials.find((c) => c.field_key === 'api_key');
  const useForValidation = await isValidationEnabled();
  const enabled = await isModuleEnabled('geoapify');
  return {
    module: 'geoapify',
    enabled,
    use_for_validation: useForValidation,
    credentials_complete: Boolean(apiKey?.has_value),
    credentials_source: apiKey?.source || 'empty',
    last_test_ok: apiKey?.last_test_ok ?? null,
    last_tested_at: apiKey?.last_tested_at ?? null,
  };
}

/**
 * @param {{ text?: string, address?: object, order_id?: number|string, force?: boolean }} opts
 */
async function validateAddress(opts = {}) {
  if (!(await isValidationEnabled())) {
    throw new AppError(
      403,
      'VALIDATION_DISABLED',
      'Verificação de endereço desabilitada. Ative “Usar na verificação de endereço” em Serviços externos → Geoapify.'
    );
  }

  let address = normalizeAddressBody(opts.address);
  let order = null;
  const orderId = opts.order_id != null ? opts.order_id : null;

  if (orderId) {
    order = await itemsRepository.getItem('orders', orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Pedido ${orderId} não encontrado`);
    }
    if (!address) address = normalizeAddressBody(order.address);
    if (
      !opts.force &&
      order.address_validation != null &&
      String(order.address_validation).trim() !== ''
    ) {
      return {
        skipped: true,
        reason: 'already_validated',
        status: order.address_validation,
        valid: order.address_validation === 'válido',
      };
    }
  }

  if (!address || !hasStructuredAddress(address)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'address estruturado é obrigatório (street + cep)');
  }

  const text = String(opts.text || '').trim() || formatAddressText(address);
  if (!text) {
    throw new AppError(400, 'VALIDATION_ERROR', 'text é obrigatório');
  }

  const viacepReport = await fetchViaCepReport(address);
  const geo = await geocodeSearch(text);
  const features = Array.isArray(geo?.features) ? geo.features : [];
  const composite = evaluateCompositeWithViaCep(features, address, viacepReport);

  if (orderId && composite?.status) {
    await itemsRepository.updateItem('orders', orderId, {
      address_validation: composite.status,
      date_updated: new Date().toISOString(),
    });
  }

  return composite;
}

module.exports = {
  validateAddress,
  formatAddressText,
  hasStructuredAddress,
  normalizeAddressBody,
  isValidationEnabled,
  getValidationStatus,
};
