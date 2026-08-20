'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const { query } = require('../../db/pool');
const itemsRepository = require('../../repositories/itemsRepository');
const { withSkipSync } = require('./syncOrders');
const {
  findOrderByExternalId,
  bodyToLocalOutboundPatch,
  issueOutboundToken,
  assertOutboundAuth,
  ensureOutboundCredentials,
} = require('./outbound');
const auditLog = require('./auditLog');

/**
 * Auth do webhook = mesmas credenciais outbound (legado → OSS).
 * Token: igual ao POST …/outbound/auth/token.
 */
async function issueWebhookToken({ client_id, client_secret }) {
  await ensureOutboundCredentials();
  return issueOutboundToken({ client_id, client_secret });
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { client_id: decoded.slice(0, idx), client_secret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

async function assertWebhookAuth(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return assertOutboundAuth(req);
  }

  await ensureOutboundCredentials();
  const resolved = await credentialsService.resolveAll('soucannabis_orders_outbound');
  const expectedId = String(resolved.client_id || '').trim();
  const expectedSecret = String(resolved.client_secret || '').trim();
  if (!expectedId || !expectedSecret) {
    throw new AppError(401, 'UNAUTHORIZED', 'Credenciais outbound não configuradas');
  }

  const basic = parseBasicAuth(header);
  const body = req.body || {};
  const clientId = String(basic?.client_id || body.client_id || req.headers['x-client-id'] || '').trim();
  const clientSecret = String(
    basic?.client_secret || body.client_secret || req.headers['x-client-secret'] || ''
  ).trim();

  if (clientId && clientSecret && clientId === expectedId && clientSecret === expectedSecret) {
    return { sub: 'soucannabis_outbound', via: basic ? 'basic' : 'credentials' };
  }

  throw new AppError(
    401,
    'UNAUTHORIZED',
    'Autenticação inválida: use Bearer (token outbound), Basic ou client_id/client_secret outbound'
  );
}

async function findOrderForSync(item = {}) {
  const externalId =
    item.external_id != null
      ? String(item.external_id).trim()
      : item.order_code != null
        ? String(item.order_code).trim()
        : '';
  if (externalId) {
    const byExt = await findOrderByExternalId(externalId);
    if (byExt) return byExt;
  }

  const remoteIdRaw =
    item.soucannabis_order_id != null
      ? item.soucannabis_order_id
      : item.id != null
        ? item.id
        : null;
  const remoteId = remoteIdRaw != null ? String(remoteIdRaw).trim() : '';
  if (remoteId) {
    const res = await query(
      `SELECT * FROM orders WHERE soucannabis_order_id::text = $1 LIMIT 1`,
      [remoteId]
    );
    if (res.rows[0]) return res.rows[0];
  }

  return null;
}

function normalizeSyncItems(body = {}) {
  if (Array.isArray(body.orders)) return body.orders;
  if (body.order && typeof body.order === 'object') return [body.order];
  if (
    body.external_id != null ||
    body.order_code != null ||
    body.id != null ||
    body.soucannabis_order_id != null
  ) {
    return [body];
  }
  return [];
}

function resolveRemoteId(item = {}) {
  if (item.soucannabis_order_id != null && String(item.soucannabis_order_id).trim()) {
    return String(item.soucannabis_order_id).trim();
  }
  if (item.id != null && String(item.id).trim() && !Number.isNaN(Number(item.id))) {
    return String(item.id).trim();
  }
  return null;
}

/**
 * Sincronização manual SC → OSS (legado envia snapshot/delta de pedidos).
 * Atualiza pedidos locais já mapeados; não cria pedidos novos.
 */
async function applyManualOrdersSync(body = {}, meta = {}) {
  const items = normalizeSyncItems(body);
  if (!items.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Envie { order }, { orders: [...] } ou um objeto de pedido com external_id / id'
    );
  }

  const correlationId = meta.correlation_id || auditLog.newCorrelationId();
  const results = [];
  for (const item of items) {
    const externalKey =
      item.external_id != null
        ? String(item.external_id)
        : item.order_code != null
          ? String(item.order_code)
          : item.id != null
            ? String(item.id)
            : null;
    try {
      const order = await findOrderForSync(item);
      if (!order) {
        await auditLog.recordSafe({
          direction: 'inbound',
          source: 'webhook_sync',
          action: 'sync',
          http_method: meta.http_method || 'POST',
          http_path: meta.http_path || '/webhooks/orders/sync',
          status: 'error',
          error_code: 'NOT_FOUND',
          error_message: 'Pedido não encontrado nesta instalação',
          order_code: externalKey,
          soucannabis_order_id: resolveRemoteId(item),
          correlation_id: correlationId,
          request_payload: item,
          client_id: meta.client_id || null,
        });
        results.push({
          ok: false,
          external_id: externalKey,
          error: 'Pedido não encontrado nesta instalação',
          code: 'NOT_FOUND',
        });
        continue;
      }

      // allowClear: sync manual do legado deve propagar remoções (null → limpar).
      const localPatch = bodyToLocalOutboundPatch(item, order, { allowClear: true });
      const remoteId = resolveRemoteId(item);
      if (remoteId) localPatch.soucannabis_order_id = remoteId;
      localPatch.soucannabis_synced_at = new Date().toISOString();
      localPatch.soucannabis_sync_error = null;

      const updated = await withSkipSync(order.id, async () =>
        itemsRepository.updateItem('orders', order.id, {
          ...localPatch,
          date_updated: new Date().toISOString(),
        })
      );

      const before = auditLog.orderSnapshot(order);
      const after = auditLog.orderSnapshot(updated);
      const patchedKeys = Object.keys(localPatch).filter(
        (k) => !['soucannabis_synced_at', 'soucannabis_sync_error', 'date_updated'].includes(k)
      );
      await auditLog.recordSafe({
        direction: 'inbound',
        source: 'webhook_sync',
        action: 'sync',
        http_method: meta.http_method || 'POST',
        http_path: meta.http_path || '/webhooks/orders/sync',
        status: 'ok',
        local_order_id: order.id,
        order_code: order.order_code != null ? String(order.order_code) : externalKey,
        soucannabis_order_id: updated.soucannabis_order_id || remoteId || order.soucannabis_order_id,
        user_code: updated.user_code || order.user_code,
        correlation_id: correlationId,
        request_payload: item,
        response_payload: { patched_keys: patchedKeys },
        before_snapshot: before,
        after_snapshot: after,
        changed_keys: auditLog.diffKeys(before, after),
        client_id: meta.client_id || null,
      });

      results.push({
        ok: true,
        external_id: order.order_code || externalKey,
        local_order_id: order.id,
        soucannabis_order_id: updated.soucannabis_order_id || remoteId || order.soucannabis_order_id,
        patched_keys: patchedKeys,
      });
    } catch (err) {
      await auditLog.recordSafe({
        direction: 'inbound',
        source: 'webhook_sync',
        action: 'sync',
        http_method: meta.http_method || 'POST',
        http_path: meta.http_path || '/webhooks/orders/sync',
        status: 'error',
        error_code: err?.code || 'SYNC_ERROR',
        error_message: err?.message || String(err),
        order_code: externalKey,
        soucannabis_order_id: resolveRemoteId(item),
        correlation_id: correlationId,
        request_payload: item,
        client_id: meta.client_id || null,
      });
      results.push({
        ok: false,
        external_id: externalKey,
        error: err?.message || String(err),
        code: err?.code || 'SYNC_ERROR',
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    synced: okCount,
    failed: results.length - okCount,
    correlation_id: correlationId,
    results,
  };
}

function webhookPaths() {
  return {
    token: '/api/v1/modules/soucannabis_orders/webhooks/auth/token',
    /** Também aceita token de POST …/outbound/auth/token (mesmas credenciais). */
    outbound_token: '/api/v1/modules/soucannabis_orders/outbound/auth/token',
    orders_sync: '/api/v1/modules/soucannabis_orders/webhooks/orders/sync',
  };
}

module.exports = {
  issueWebhookToken,
  assertWebhookAuth,
  /** @deprecated use issueWebhookToken */
  issueConnectionToken: issueWebhookToken,
  /** @deprecated use assertWebhookAuth */
  assertConnectionAuth: assertWebhookAuth,
  findOrderForSync,
  normalizeSyncItems,
  resolveRemoteId,
  applyManualOrdersSync,
  webhookPaths,
};
