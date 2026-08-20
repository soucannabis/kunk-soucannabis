'use strict';

const crypto = require('crypto');

/**
 * Sign body with HMAC-SHA256. Header value: sha256=<hex>
 */
function signPayload(secret, body, timestamp) {
  const payload = `${timestamp}.${body}`;
  const digest = crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
  return `sha256=${digest}`;
}

function verifySignature(secret, body, timestamp, signatureHeader) {
  const expected = signPayload(secret, body, timestamp);
  const got = String(signatureHeader || '');
  if (expected.length !== got.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

function buildHeaders({ eventId, deliveryId, table, action, secret, body, timestamp }) {
  const ts = String(timestamp || Math.floor(Date.now() / 1000));
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Kunk-Webhooks/1.0',
    'X-Kunk-Event': String(eventId),
    'X-Kunk-Delivery': String(deliveryId),
    'X-Kunk-Table': String(table),
    'X-Kunk-Action': String(action),
    'X-Kunk-Timestamp': ts,
    'X-Kunk-Signature': signPayload(secret, body, ts),
  };
}

module.exports = {
  signPayload,
  verifySignature,
  buildHeaders,
};
