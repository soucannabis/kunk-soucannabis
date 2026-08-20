'use strict';

const itemsRepository = require('../../repositories/itemsRepository');
const client = require('./client');
const { getScConfig, isSplitReady } = require('./config');
const { toRemoteCreatePayload, toRemotePatchPayload } = require('./mapOrderPayload');
const { enrichExternalPaymentInfo } = require('./externalPaymentInfo');
const { loadUserByCode } = require('../pagarme/orders');
const orderStatuses = require('../orderStatusesService');
const { AppError } = require('../../utils/response');
const auditLog = require('./auditLog');

/** Suppress re-entrant sync when applying outbound patches. */
const skipSync = new Set();

function withSkipSync(orderId, fn) {
  skipSync.add(Number(orderId));
  return Promise.resolve()
    .then(fn)
    .finally(() => skipSync.delete(Number(orderId)));
}

function isSkipped(orderId) {
  return skipSync.has(Number(orderId));
}

async function markSyncError(orderId, err) {
  const msg = err?.message || String(err);
  try {
    await itemsRepository.updateItem('orders', orderId, {
      soucannabis_sync_error: msg.slice(0, 2000),
    });
  } catch {
    /* ignore */
  }
}

async function markSyncOk(orderId, remoteId, extra = {}) {
  await itemsRepository.updateItem('orders', orderId, {
    soucannabis_order_id: remoteId != null ? String(remoteId) : undefined,
    soucannabis_synced_at: new Date().toISOString(),
    soucannabis_sync_error: null,
    ...extra,
  });
}

async function createIfNeeded(orderId, { external_payment_info: epi } = {}) {
  const sc = await getScConfig();
  if (!sc.enabled || !sc.sync_orders) return { skipped: true, reason: 'module_off' };

  const order = await itemsRepository.getItem('orders', orderId);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
  if (order.soucannabis_order_id) {
    return { skipped: true, reason: 'already_synced', remote_id: order.soucannabis_order_id };
  }

  const statuses = await orderStatuses.getOrderStatuses();
  const paid = orderStatuses.getPaidValue(statuses);
  const awaitingApproval = orderStatuses.getAwaitingApprovalValue(statuses);
  if (order.status !== paid) {
    return { skipped: true, reason: 'not_paid' };
  }

  const total = Number(order.total || 0);
  let baseInfo = epi || order.external_payment_info || null;

  if (total > 0) {
    if (!baseInfo) {
      baseInfo = {
        provider: 'manual',
        method: 'comprovante',
        paid_at: new Date().toISOString(),
      };
    }
  } else {
    baseInfo = baseInfo || {
      provider: 'none',
      method: 'zero_total',
      paid_at: new Date().toISOString(),
    };
  }

  let externalPaymentInfo;
  try {
    externalPaymentInfo = await enrichExternalPaymentInfo(order, baseInfo);
  } catch {
    externalPaymentInfo = baseInfo;
  }

  // Garante split mínimo se módulo pronto mas enrich falhou parcialmente
  try {
    if (total > 0 && (await isSplitReady()) && !externalPaymentInfo?.split?.length) {
      externalPaymentInfo = await enrichExternalPaymentInfo(order, {
        ...(externalPaymentInfo || {}),
        provider: externalPaymentInfo?.provider || 'manual',
      });
    }
  } catch {
    /* keep */
  }

  const userRow = order.user_code ? await loadUserByCode(order.user_code) : null;
  const payload = await toRemoteCreatePayload(order, {
    userRow,
    externalPaymentInfo,
  });

  try {
    const created = await client.createRemoteOrder(payload);
    const remoteId = created?.id || created?.data?.id || created?.body?.id;
    if (!remoteId && created?.id == null) {
      // 409 path handled below
    }
    await markSyncOk(orderId, remoteId || created?.id, {
      external_payment_info: externalPaymentInfo,
      status: awaitingApproval,
    });
    const after = await itemsRepository.getItem('orders', orderId);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_create',
      action: 'create',
      status: 'ok',
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      soucannabis_order_id: remoteId || created?.id,
      user_code: order.user_code,
      request_payload: payload,
      response_payload: { remote_id: remoteId || created?.id, remote: created },
      before_snapshot: order,
      after_snapshot: after || order,
    });
    return { created: true, remote_id: remoteId || created?.id, remote: created };
  } catch (err) {
    if (err.code === 'SC_CONFLICT' || err.details?.status === 409) {
      const existingId = err.details?.body?.id;
      if (existingId) {
        await markSyncOk(orderId, existingId, {
          external_payment_info: externalPaymentInfo,
          status: awaitingApproval,
        });
        try {
          await client.patchRemoteOrder(
            existingId,
            toRemotePatchPayload({
              status: payload.status,
              payment_date: payload.payment_date,
              external_payment_info: externalPaymentInfo,
            })
          );
        } catch {
          /* best effort */
        }
        const after = await itemsRepository.getItem('orders', orderId);
        await auditLog.recordSafe({
          direction: 'outbound',
          source: 'sync_create',
          action: 'create',
          status: 'ok',
          local_order_id: orderId,
          order_code: order.order_code != null ? String(order.order_code) : null,
          soucannabis_order_id: existingId,
          user_code: order.user_code,
          request_payload: payload,
          response_payload: { conflict: true, remote_id: existingId },
          before_snapshot: order,
          after_snapshot: after || order,
        });
        return { created: false, conflict: true, remote_id: existingId };
      }
    }
    await markSyncError(orderId, err);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_create',
      action: 'create',
      status: 'error',
      error_code: err?.code || 'SC_CREATE_FAILED',
      error_message: err?.message || String(err),
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      user_code: order.user_code,
      request_payload: payload,
      before_snapshot: order,
    });
    throw err;
  }
}

async function mirrorIfMapped(orderId, patch) {
  if (isSkipped(orderId)) return { skipped: true, reason: 'outbound_loop' };
  const sc = await getScConfig();
  if (!sc.enabled || !sc.sync_orders) return { skipped: true, reason: 'module_off' };

  const order = await itemsRepository.getItem('orders', orderId);
  if (!order?.soucannabis_order_id) return { skipped: true, reason: 'not_mapped' };

  try {
    const remotePatch = toRemotePatchPayload(patch || order);
    if (!Object.keys(remotePatch).length) return { skipped: true, reason: 'empty_patch' };
    const remote = await client.patchRemoteOrder(order.soucannabis_order_id, remotePatch);
    await markSyncOk(orderId, order.soucannabis_order_id);
    const after = await itemsRepository.getItem('orders', orderId);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_mirror',
      action: 'update',
      status: 'ok',
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      soucannabis_order_id: order.soucannabis_order_id,
      user_code: order.user_code,
      request_payload: remotePatch,
      response_payload: { mirrored: true, remote },
      before_snapshot: order,
      after_snapshot: after || order,
    });
    return { mirrored: true, remote };
  } catch (err) {
    await markSyncError(orderId, err);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_mirror',
      action: 'update',
      status: 'error',
      error_code: err?.code || 'SC_MIRROR_FAILED',
      error_message: err?.message || String(err),
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      soucannabis_order_id: order.soucannabis_order_id,
      user_code: order.user_code,
      request_payload: patch || order,
      before_snapshot: order,
    });
    return { mirrored: false, error: err.message };
  }
}

function isRemoteNotFound(err) {
  const remoteStatus = Number(err?.details?.remote_status || err?.details?.status || 0);
  return remoteStatus === 404;
}

async function deleteIfMapped(orderId) {
  if (isSkipped(orderId)) return { skipped: true, reason: 'outbound_loop' };
  const sc = await getScConfig();
  if (!sc.enabled || !sc.sync_orders) return { skipped: true, reason: 'module_off' };

  const order = await itemsRepository.getItem('orders', orderId);
  if (!order?.soucannabis_order_id) return { skipped: true, reason: 'not_mapped' };

  try {
    await client.deleteRemoteOrder(order.soucannabis_order_id);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_delete',
      action: 'delete',
      status: 'ok',
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      soucannabis_order_id: order.soucannabis_order_id,
      user_code: order.user_code,
      before_snapshot: order,
      response_payload: { deleted: true },
    });
    return { deleted: true };
  } catch (err) {
    // Já removido na SC: segue com exclusão local.
    if (isRemoteNotFound(err)) {
      await auditLog.recordSafe({
        direction: 'outbound',
        source: 'sync_delete',
        action: 'delete',
        status: 'ok',
        local_order_id: orderId,
        order_code: order.order_code != null ? String(order.order_code) : null,
        soucannabis_order_id: order.soucannabis_order_id,
        user_code: order.user_code,
        before_snapshot: order,
        response_payload: { deleted: true, already_gone: true },
      });
      return { deleted: true, already_gone: true };
    }
    await markSyncError(orderId, err);
    await auditLog.recordSafe({
      direction: 'outbound',
      source: 'sync_delete',
      action: 'delete',
      status: 'error',
      error_code: err?.code || 'SC_DELETE_FAILED',
      error_message: err?.message || String(err),
      local_order_id: orderId,
      order_code: order.order_code != null ? String(order.order_code) : null,
      soucannabis_order_id: order.soucannabis_order_id,
      user_code: order.user_code,
      before_snapshot: order,
    });
    if (err instanceof AppError) throw err;
    throw new AppError(
      502,
      'SC_DELETE_FAILED',
      err?.message || 'Falha ao excluir pedido na SouCannabis',
      { order_id: orderId, soucannabis_order_id: order.soucannabis_order_id }
    );
  }
}

module.exports = {
  withSkipSync,
  isSkipped,
  createIfNeeded,
  mirrorIfMapped,
  deleteIfMapped,
  markSyncError,
  markSyncOk,
};
