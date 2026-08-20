'use strict';

const client = require('./client');
const config = require('./config');
const syncOrders = require('./syncOrders');
const outbound = require('./outbound');
const webhookSync = require('./webhookSync');
const auditLog = require('./auditLog');
const { probePsp } = require('../pagarme/probePsp');
const pagarme = require('../pagarme');
const { isModuleEnabled } = require('../moduleFlags');
const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');

async function getStatus() {
  await client.ensureCredentialRows();
  const sc = await config.getScConfig();
  const pagarmeStatus = await pagarme.getStatus();
  const creds = await credentialsService.listPublic('soucannabis_orders');
  const hasClient = creds.some((c) => c.field_key === 'client_id' && c.has_value);
  const hasSecret = creds.some((c) => c.field_key === 'client_secret' && c.has_value);
  const hasBase = creds.some((c) => c.field_key === 'base_url' && c.has_value);
  const splitReady = await config.isSplitReady();

  return {
    module: 'soucannabis_orders',
    enabled: await isModuleEnabled('soucannabis_orders'),
    pagarme_ok: Boolean(pagarmeStatus.enabled && pagarmeStatus.is_psp),
    is_psp: pagarmeStatus.is_psp,
    credentials_complete: Boolean(hasClient && hasSecret && hasBase),
    payment_percentage: sc.payment_percentage,
    payment_percentage_ok: config.isIntegerPercentage(sc.payment_percentage),
    remote_app_id: sc.remote_app_id,
    soucannabis_recipient_id: pagarmeStatus.soucannabis_recipient_id,
    association_recipient_id: pagarmeStatus.association_recipient_id,
    split_ready: splitReady,
    sync_products: sc.sync_products,
    sync_tags: sc.sync_tags,
    sync_orders: sc.sync_orders,
    last_me_at: sc.last_me_at,
  };
}

async function runTest(creds) {
  async function step(name, fn) {
    try {
      return await fn();
    } catch (err) {
      const details =
        err instanceof AppError
          ? { ...(err.details || {}), step: err.details?.step || name }
          : { step: name, cause: String(err?.message || err) };
      const code = err instanceof AppError ? err.code : 'SC_TEST_FAILED';
      const status = err instanceof AppError ? err.status : 502;
      const message =
        err instanceof AppError
          ? err.message.startsWith('[')
            ? err.message
            : `[${name}] ${err.message}`
          : `[${name}] ${err.message || String(err)}`;
      console.error('[soucannabis_orders.test]', {
        step: name,
        code,
        status,
        message,
        details,
      });
      throw new AppError(status, code, message, details);
    }
  }

  await step('pagarme_enabled', async () => {
    const pagarmeOn = await isModuleEnabled('pagarme');
    if (!pagarmeOn) {
      throw new AppError(
        400,
        'DEPENDENCY_PAGARME',
        'Ative e valide o Pagar.me (API + webhooks) antes de autenticar Pedidos SouCannabis',
        { step: 'pagarme_enabled' }
      );
    }
  });

  await step('pagarme_psp', async () => {
    await probePsp();
  });

  const result = await step('soucannabis_connection', async () => client.testConnection(creds));
  await step('cache_me', async () => config.cacheMe(result.me));
  return result;
}

async function listProducts() {
  const sc = await config.getScConfig();
  if (!sc.enabled && !(await isModuleEnabled('soucannabis_orders'))) {
    throw new AppError(503, 'MODULE_DISABLED', 'Módulo soucannabis_orders não está ativo');
  }
  const { getOrSet, cacheTtl, keys } = require('../cache');
  return getOrSet(keys.SOUCANNABIS_PRODUCTS, cacheTtl.PRODUCTS_CATALOG_MS, async () => {
    const data = await client.getProducts();
    return Array.isArray(data) ? data : data?.data || [];
  });
}

async function listTags() {
  const { getOrSet, cacheTtl, keys } = require('../cache');
  return getOrSet(keys.SOUCANNABIS_TAGS, cacheTtl.TAGS_MS, async () => {
    const data = await client.getTags();
    return Array.isArray(data) ? data : data?.data || [];
  });
}

async function getMeCached() {
  const me = await client.getMe();
  await config.cacheMe(me);
  return me;
}

module.exports = {
  client,
  config,
  syncOrders,
  outbound,
  webhookSync,
  auditLog,
  getStatus,
  runTest,
  listProducts,
  listTags,
  getMeCached,
  ensureCredentialRows: client.ensureCredentialRows,
  testConnection: runTest,
};
