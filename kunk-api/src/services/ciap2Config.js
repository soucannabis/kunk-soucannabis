'use strict';

const { query } = require('../db/pool');
const systemConfigService = require('./systemConfigService');

const CONFIG_KEY = 'modules.ciap2.enabled';

function asBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/**
 * CIAP-2 module: Admin (`system_configs`) is the source of truth (default on).
 */
async function isEnabled() {
  const result = await query(
    `SELECT value FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [CONFIG_KEY]
  );
  return asBool(result.rows[0]?.value, true);
}

async function setEnabled(enabled) {
  const serialized = enabled ? 'true' : 'false';
  const existing = await query(
    `SELECT id FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [CONFIG_KEY]
  );
  if (existing.rows[0]?.id) {
    await systemConfigService.updateConfig(existing.rows[0].id, { value: serialized });
  } else {
    await systemConfigService.createConfig({
      system: 'modules',
      key: CONFIG_KEY,
      value: serialized,
      value_type: 'boolean',
      is_sensitive: false,
      allow_hardcoded: false,
      description: 'Módulo CIAP-2 habilitado no Kunk e no cadastramento',
    });
  }
  return { module: 'ciap2', enabled: Boolean(enabled) };
}

async function getStatus() {
  const enabled = await isEnabled();
  return { module: 'ciap2', enabled };
}

module.exports = {
  CONFIG_KEY,
  isEnabled,
  setEnabled,
  getStatus,
};
