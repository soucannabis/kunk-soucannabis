'use strict';

const systemConfigService = require('../systemConfigService');
const { isModuleEnabled, asBool } = require('../moduleFlags');
const { assertIntegerPercentage, isIntegerPercentage } = require('../pagarme/split');
const pagarmeConfig = require('../pagarme/config');

function asNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getModuleValues() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    return resolved.values || {};
  } catch {
    return {};
  }
}

async function getScConfig() {
  const values = await getModuleValues();
  return {
    enabled: await isModuleEnabled('soucannabis_orders'),
    sync_products: asBool(values['modules.soucannabis_orders.sync_products'], false),
    sync_tags: asBool(values['modules.soucannabis_orders.sync_tags'], false),
    sync_orders: asBool(values['modules.soucannabis_orders.sync_orders'], false),
    payment_percentage: asNumberOrNull(values['modules.soucannabis_orders.payment_percentage']),
    remote_app_id: values['modules.soucannabis_orders.remote_app_id'] || null,
    last_me_at: values['modules.soucannabis_orders.last_me_at'] || null,
  };
}

async function cacheMe(me) {
  const pct = assertIntegerPercentage(me.payment_percentage);
  await pagarmeConfig.setConfigValue(
    'modules.soucannabis_orders.payment_percentage',
    pct,
    'Cache payment_percentage /me',
    'number'
  );
  if (me.id) {
    await pagarmeConfig.setConfigValue(
      'modules.soucannabis_orders.remote_app_id',
      me.id,
      'Cache remote app id',
      'string'
    );
  }
  await pagarmeConfig.setConfigValue(
    'modules.soucannabis_orders.last_me_at',
    new Date().toISOString(),
    'Último /me',
    'string'
  );
  return pct;
}

async function isSplitReady() {
  const sc = await getScConfig();
  if (!sc.enabled) return false;
  const pagarme = await pagarmeConfig.getPagarmeConfig();
  if (!pagarme.enabled) return false;
  if (!pagarme.association_recipient_id || !pagarme.soucannabis_recipient_id) return false;
  if (!isIntegerPercentage(sc.payment_percentage)) return false;
  return true;
}

module.exports = {
  getScConfig,
  cacheMe,
  isSplitReady,
  isIntegerPercentage,
};
