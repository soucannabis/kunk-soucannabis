'use strict';

const crypto = require('crypto');
const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const { query } = require('../../db/pool');
const itemsRepository = require('../../repositories/itemsRepository');
const { withSkipSync } = require('./syncOrders');
const { toRemotePatchPayload } = require('./mapOrderPayload');
const auditLog = require('./auditLog');

async function ensureOutboundCredentials() {
  await require('./client').ensureCredentialRows();
  const resolved = await credentialsService.resolveAll('soucannabis_orders_outbound');
  let clientId = String(resolved.client_id || '').trim();
  let clientSecret = String(resolved.client_secret || '').trim();
  if (!clientId || !clientSecret) {
    clientId = clientId || `sc-out-${crypto.randomBytes(8).toString('hex')}`;
    clientSecret = clientSecret || crypto.randomBytes(24).toString('hex');
    await credentialsService.putCredentials(
      'soucannabis_orders_outbound',
      { client_id: clientId, client_secret: clientSecret, orders_path: '/modules/soucannabis_orders/outbound/orders' },
      { runTest: false }
    );
  }
  return { client_id: clientId, client_secret: clientSecret };
}

async function issueOutboundToken({ client_id, client_secret }) {
  const resolved = await credentialsService.resolveAll('soucannabis_orders_outbound');
  if (
    !client_id ||
    !client_secret ||
    client_id !== resolved.client_id ||
    client_secret !== resolved.client_secret
  ) {
    throw new AppError(401, 'UNAUTHORIZED', 'Credenciais outbound inválidas');
  }
  // Stateless short-lived token: base64 payload + hmac of secret
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub: 'soucannabis_outbound', exp }), 'utf8').toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', resolved.client_secret).update(payload).digest('base64url');
  return {
    access_token: `${payload}.${sig}`,
    token_type: 'Bearer',
    expires_in: 3600,
  };
}

function verifyOutboundBearer(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return true; // detailed check in middleware with secret
}

async function assertOutboundAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Bearer token ausente');
  }
  const token = header.slice(7);
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) throw new AppError(401, 'UNAUTHORIZED', 'Token inválido');
  const resolved = await credentialsService.resolveAll('soucannabis_orders_outbound');
  if (!resolved.client_secret) throw new AppError(401, 'UNAUTHORIZED', 'Outbound não configurado');
  const expected = crypto
    .createHmac('sha256', resolved.client_secret)
    .update(payloadB64)
    .digest('base64url');
  if (expected !== sig) throw new AppError(401, 'UNAUTHORIZED', 'Token inválido');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token inválido');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token expirado');
  }
  return payload;
}

async function findOrderByExternalId(externalId) {
  const res = await query(
    `SELECT * FROM orders WHERE order_code::text = $1 OR CAST(id AS text) = $1 LIMIT 1`,
    [String(externalId)]
  );
  return res.rows[0] || null;
}

function hasMeaningfulAddress(address) {
  if (!address || typeof address !== 'object') return false;
  const street = address.street || address.line_1;
  return Boolean(String(street || '').trim());
}

/** Campos anuláveis: chave no body SC → coluna local. Com allowClear, null explícito limpa. */
const CLEARABLE_FIELDS = [
  ['tracking_code', 'tracking_code'],
  ['tracking_code_date', 'tracking_code_date'],
  ['payment_date', 'payment_date'],
  ['payment_form', 'payment_method'],
  ['tags', 'tags'],
  ['info', 'details'],
  ['delivery_price', 'delivery_price'],
  ['discount', 'discount'],
  ['donation', 'donation'],
  ['external_delivery_type', 'external_delivery_type'],
];

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeDeliveryType(value) {
  const t = String(value ?? '').trim().toLowerCase();
  return t || null;
}

/**
 * Converte body outbound (SC) → patch local, sem apagar nome/endereço/itens com vazios.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allowClear] Quando true, `null` (ou string vazia) explícito em campos
 *   anuláveis vira limpeza (grava null) em vez de ser descartado. Usado no webhook de sync manual
 *   para propagar remoções feitas no Kunk legado.
 */
function bodyToLocalOutboundPatch(body = {}, existing = {}, opts = {}) {
  const allowClear = opts.allowClear === true;
  const localPatch = {};

  if (body.status != null) localPatch.status = body.status;
  if (body.items != null) {
    const incoming = body.items;
    const existingItems = existing.items;
    const wouldWipe =
      Array.isArray(incoming) &&
      incoming.length === 0 &&
      Array.isArray(existingItems) &&
      existingItems.length > 0;
    if (!wouldWipe) localPatch.items = incoming;
  }
  if (body.total != null) localPatch.total = body.total;

  for (const [src, dest] of CLEARABLE_FIELDS) {
    if (body[src] != null) {
      localPatch[dest] =
        dest === 'external_delivery_type' ? normalizeDeliveryType(body[src]) : body[src];
      if (dest === 'external_delivery_type' && localPatch[dest] == null && !allowClear) {
        delete localPatch[dest];
      }
    } else if (allowClear && has(body, src)) {
      // null/'' explícito vindo do legado → limpar coluna local.
      localPatch[dest] = null;
    }
  }

  if (body.address != null && hasMeaningfulAddress(body.address)) {
    localPatch.address = body.address;
  }
  if (body.name_associate != null) {
    const name = String(body.name_associate).trim();
    if (name) {
      localPatch.associate_name = name;
      localPatch.receiver_name = name;
    }
  }
  if (body.external_payment_info != null) {
    localPatch.external_payment_info = body.external_payment_info;
  } else if (allowClear && has(body, 'external_payment_info')) {
    localPatch.external_payment_info = null;
  }

  return localPatch;
}

async function applyOutboundPatch(externalId, body = {}, meta = {}) {
  const order = await findOrderByExternalId(externalId);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  const localPatch = bodyToLocalOutboundPatch(body, order);
  if (!Object.keys(localPatch).length) {
    await auditLog.recordSafe({
      direction: 'inbound',
      source: 'outbound_patch',
      action: 'update',
      http_method: meta.http_method || 'PATCH',
      http_path: meta.http_path || `/outbound/orders/${externalId}`,
      status: 'ok',
      local_order_id: order.id,
      order_code: order.order_code != null ? String(order.order_code) : String(externalId),
      soucannabis_order_id: order.soucannabis_order_id,
      user_code: order.user_code,
      request_payload: body,
      response_payload: { patched_keys: [] },
      before_snapshot: order,
      after_snapshot: order,
      changed_keys: [],
      client_id: meta.client_id || null,
    });
    return order;
  }

  const updated = await withSkipSync(order.id, async () =>
    itemsRepository.updateItem('orders', order.id, {
      ...localPatch,
      date_updated: new Date().toISOString(),
    })
  );

  const before = auditLog.orderSnapshot(order);
  const after = auditLog.orderSnapshot(updated);
  await auditLog.recordSafe({
    direction: 'inbound',
    source: 'outbound_patch',
    action: 'update',
    http_method: meta.http_method || 'PATCH',
    http_path: meta.http_path || `/outbound/orders/${externalId}`,
    status: 'ok',
    local_order_id: order.id,
    order_code: order.order_code != null ? String(order.order_code) : String(externalId),
    soucannabis_order_id: updated.soucannabis_order_id || order.soucannabis_order_id,
    user_code: updated.user_code || order.user_code,
    request_payload: body,
    response_payload: { patched_keys: Object.keys(localPatch) },
    before_snapshot: before,
    after_snapshot: after,
    changed_keys: auditLog.diffKeys(before, after),
    client_id: meta.client_id || null,
  });

  return updated;
}

async function applyOutboundDelete(externalId, meta = {}) {
  const order = await findOrderByExternalId(externalId);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
  // Exclusão na SC não remove o pedido na associação.
  await auditLog.recordSafe({
    direction: 'inbound',
    source: 'outbound_delete_attempt',
    action: 'reject',
    http_method: meta.http_method || 'DELETE',
    http_path: meta.http_path || `/outbound/orders/${externalId}`,
    status: 'rejected',
    error_code: 'DELETE_NOT_ALLOWED',
    error_message: 'Exclusão de pedido via outbound não é permitida; o pedido permanece na associação',
    local_order_id: order.id,
    order_code: order.order_code != null ? String(order.order_code) : String(externalId),
    soucannabis_order_id: order.soucannabis_order_id,
    user_code: order.user_code,
    before_snapshot: order,
    after_snapshot: order,
    client_id: meta.client_id || null,
  });
  throw new AppError(
    405,
    'DELETE_NOT_ALLOWED',
    'Exclusão de pedido via outbound não é permitida; o pedido permanece na associação',
    { external_id: String(externalId), local_order_id: order.id }
  );
}

module.exports = {
  ensureOutboundCredentials,
  issueOutboundToken,
  verifyOutboundBearer,
  assertOutboundAuth,
  findOrderByExternalId,
  applyOutboundPatch,
  applyOutboundDelete,
  bodyToLocalOutboundPatch,
  hasMeaningfulAddress,
  toRemotePatchPayload,
};
