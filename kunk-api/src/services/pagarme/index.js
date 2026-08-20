'use strict';

const client = require('./client');
const config = require('./config');
const split = require('./split');
const { probePsp } = require('./probePsp');
const orders = require('./orders');
const webhook = require('./webhook');
const hooksSetup = require('./hooksSetup');
const credentialsService = require('../credentialsService');
const { isModuleEnabled } = require('../moduleFlags');

async function getStatus(req) {
  await client.ensureCredentialRows();
  const cfg = await config.getPagarmeConfig();
  const creds = await credentialsService.listPublic('pagarme');
  const secret = creds.find((c) => c.field_key === 'secret_key');
  let isPsp = null;
  let pspError = null;
  if (secret?.has_value) {
    try {
      const probe = await probePsp();
      isPsp = probe.is_psp;
    } catch (err) {
      isPsp = false;
      pspError = err.code || err.message;
    }
  }

  const splitMode = await orders.isSplitMode();
  let paymentPercentage = null;
  let percentageOk = false;
  try {
    paymentPercentage = await orders.getScPaymentPercentage();
    percentageOk = split.isIntegerPercentage(paymentPercentage);
  } catch {
    percentageOk = false;
  }

  let webhooks = null;
  try {
    webhooks = await hooksSetup.getWebhooksStatus(req);
  } catch (err) {
    webhooks = { error: err.message || String(err), ready: false };
  }

  return {
    module: 'pagarme',
    enabled: cfg.enabled || (await isModuleEnabled('pagarme')),
    use_for_orders: cfg.use_for_orders,
    use_for_services: cfg.use_for_services,
    credentials_complete: Boolean(secret?.has_value),
    is_psp: isPsp,
    psp_error: pspError,
    association_recipient_configured: Boolean(cfg.association_recipient_id),
    soucannabis_recipient_configured: Boolean(cfg.soucannabis_recipient_id),
    association_recipient_id: cfg.association_recipient_id,
    soucannabis_recipient_id: cfg.soucannabis_recipient_id,
    split_mode: splitMode,
    payment_percentage: paymentPercentage,
    payment_percentage_ok: percentageOk,
    card_fee_percent: cfg.card_fee_percent,
    webhooks,
  };
}

async function createRecipient(body) {
  return client.request('/recipients', { method: 'POST', body });
}

/**
 * Cria recebedor da associação na Pagarme e grava association_recipient_id (modo split).
 */
async function createAssociationRecipient(body, { force = false } = {}) {
  const cfg = await config.getPagarmeConfig();
  if (cfg.association_recipient_id && !force) {
    return {
      recipient_id: cfg.association_recipient_id,
      existing: true,
    };
  }
  await probePsp();
  const recipient = await createRecipient(body);
  const recipientId = String(recipient?.id || recipient?.recipient_id || '').trim();
  if (!recipientId) {
    const { AppError } = require('../../utils/response');
    throw new AppError(502, 'PAGARME_ERROR', 'Resposta Pagarme sem recipient id');
  }
  await config.setConfigValue(
    'modules.pagarme.association_recipient_id',
    recipientId,
    'Recipient Pagarme da associação (split)',
    'string'
  );
  return { recipient_id: recipientId, recipient, existing: false };
}

async function createSoucannabisRecipient(body, { force = false } = {}) {
  const cfg = await config.getPagarmeConfig();
  if (cfg.soucannabis_recipient_id && !force) {
    return {
      recipient_id: cfg.soucannabis_recipient_id,
      existing: true,
    };
  }
  await probePsp();
  const recipient = await createRecipient(body);
  const recipientId = String(recipient?.id || recipient?.recipient_id || '').trim();
  if (!recipientId) {
    const { AppError } = require('../../utils/response');
    throw new AppError(502, 'PAGARME_ERROR', 'Resposta Pagarme sem recipient id');
  }
  await config.setConfigValue(
    'modules.pagarme.soucannabis_recipient_id',
    recipientId,
    'Recipient Pagarme SouCannabis',
    'string'
  );
  return { recipient_id: recipientId, recipient, existing: false };
}

async function testConnection(creds) {
  await client.testConnection(creds);
  await probePsp(creds);
  return { ok: true, is_psp: true };
}

module.exports = {
  client,
  config,
  split,
  probePsp,
  orders,
  webhook,
  hooksSetup,
  getStatus,
  createRecipient,
  createAssociationRecipient,
  createSoucannabisRecipient,
  testConnection,
  ensureCredentialRows: client.ensureCredentialRows,
  createCheckout: orders.createCheckout,
  ensureWebhooks: hooksSetup.ensureWebhooks,
  validateWebhooks: hooksSetup.validateWebhooks,
  getWebhooksStatus: hooksSetup.getWebhooksStatus,
  clearWebhookValidation: hooksSetup.clearWebhookValidation,
  createTestPaymentLink: hooksSetup.createTestPaymentLink,
  listHooks: hooksSetup.listHooks,
  getHook: hooksSetup.getHook,
  retryHook: hooksSetup.retryHook,
};
