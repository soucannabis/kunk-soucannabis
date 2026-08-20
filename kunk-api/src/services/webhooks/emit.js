'use strict';

const { v4: uuidv4 } = require('uuid');
const { sanitizeRecord } = require('./sanitize');
const { isWebhookTable, isWebhookAction } = require('./catalog');

/**
 * Fail-soft enqueue of webhook deliveries for matching endpoints.
 */
async function emitWebhook({ table, action, recordId, data } = {}) {
  try {
    if (!isWebhookTable(table) || !isWebhookAction(action)) return { enqueued: 0 };
    const repository = require('./repository');
    const endpoints = await repository.listMatchingEndpoints(table, action);
    if (!endpoints.length) return { enqueued: 0 };

    const eventId = uuidv4();
    const sanitized = sanitizeRecord(table, data);
    const payload = {
      id: `evt_${eventId}`,
      table,
      action,
      record_id: recordId != null ? String(recordId) : null,
      occurred_at: new Date().toISOString(),
      data: sanitized ?? null,
    };

    const rows = endpoints.map((ep) => ({
      endpoint_id: ep.id,
      event_id: eventId,
      table_name: table,
      action,
      record_id: payload.record_id,
      payload,
    }));

    const inserted = await repository.enqueueDeliveries(rows);
    return { enqueued: inserted.length, event_id: eventId };
  } catch (err) {
    console.warn('[webhooks] emit failed:', err.message || err);
    return { enqueued: 0, error: err.message };
  }
}

function emitWebhookSafe(args) {
  void emitWebhook(args);
}

module.exports = { emitWebhook, emitWebhookSafe };
