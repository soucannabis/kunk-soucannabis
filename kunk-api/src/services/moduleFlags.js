'use strict';

const { query } = require('../db/pool');

function asBool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/**
 * Resolve whether a module is enabled for *uso no sistema*.
 * Source of truth: Admin (`system_configs` modules.{name}.enabled).
 * Sem valor no Admin → desabilitado.
 *
 * Auth / OAuth / teste NÃO devem depender disso — rotas de setup ficam
 * fora de requireModule (padrão Pagar.me).
 */
async function isModuleEnabled(name) {
  const key = `modules.${name}.enabled`;
  const result = await query(
    `SELECT value FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [key]
  );
  let enabled = false;
  if (result.rows[0] && result.rows[0].value != null && result.rows[0].value !== '') {
    enabled = asBool(result.rows[0].value, false);
  }
  if (!enabled) return false;

  // Pagar.me só fica efetivamente ativo com Secret key (ativação após link de teste no Admin).
  if (name === 'pagarme') {
    try {
      const credentialsService = require('./credentialsService');
      const creds = await credentialsService.listPublic('pagarme');
      const hasSecret = Boolean(creds.find((c) => c.field_key === 'secret_key')?.has_value);
      if (!hasSecret) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** @deprecated Env não ativa mais módulos — sempre false. Mantido por compat da API admin. */
function envModuleDefault() {
  return false;
}

/** Default de uso no sistema quando Admin nunca gravou (sempre off). */
function moduleEnabledDefault(_name) {
  return false;
}

module.exports = {
  asBool,
  isModuleEnabled,
  envModuleDefault,
  moduleEnabledDefault,
};
