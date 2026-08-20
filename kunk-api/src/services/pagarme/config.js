'use strict';

const systemConfigService = require('../systemConfigService');
const { isModuleEnabled, asBool } = require('../moduleFlags');

function asNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getPagarmeConfig() {
  let values = {};
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    values = resolved.values || {};
  } catch {
    values = {};
  }
  return {
    enabled: await isModuleEnabled('pagarme'),
    use_for_orders: asBool(values['modules.pagarme.use_for_orders'], false),
    use_for_services: asBool(values['modules.pagarme.use_for_services'], false),
    success_url: values['modules.pagarme.success_url'] || null,
    card_fee_percent: asNumber(values['modules.pagarme.card_fee_percent'], 5),
    checkout_expires_in: asNumber(values['modules.pagarme.checkout_expires_in'], 10080),
    association_recipient_id: String(values['modules.pagarme.association_recipient_id'] || '').trim() || null,
    soucannabis_recipient_id: String(values['modules.pagarme.soucannabis_recipient_id'] || '').trim() || null,
  };
}

async function setConfigValue(key, value, description, valueType = 'string') {
  const { query } = require('../../db/pool');
  const existing = await query(
    `SELECT id FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [key]
  );
  const serialized =
    valueType === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : value == null || value === ''
        ? null
        : String(value);
  if (existing.rows[0]?.id) {
    await systemConfigService.updateConfig(existing.rows[0].id, { value: serialized });
  } else {
    await systemConfigService.createConfig({
      system: 'modules',
      key,
      value: serialized,
      value_type: valueType,
      is_sensitive: false,
      allow_hardcoded: false,
      description,
    });
  }
}

module.exports = {
  getPagarmeConfig,
  setConfigValue,
};
