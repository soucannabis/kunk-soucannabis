'use strict';

const { DELIVERY_TIMEOUT_MS } = require('./catalog');
const { buildHeaders } = require('./sign');
const { assertPublicHttpUrl } = require('../../utils/publicHttpUrl');

async function postJson(url, body, headers, timeoutMs = DELIVERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    await res.text().catch(() => '');
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchDelivery(delivery, { url, secret }) {
  try {
    await assertPublicHttpUrl(url);
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err.message || 'URL interna não é permitida',
    };
  }
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = buildHeaders({
    eventId: delivery.event_id || delivery.payload?.id,
    deliveryId: delivery.id,
    table: delivery.table_name,
    action: delivery.action,
    secret,
    body,
    timestamp,
  });
  try {
    const result = await postJson(url, body, headers);
    return result;
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: null,
      error: aborted ? 'timeout' : err.message || String(err),
    };
  }
}

module.exports = { postJson, dispatchDelivery };
