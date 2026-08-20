'use strict';

const fs = require('fs');
const path = require('path');
const { query } = require('./pool');

let ensured = false;
let ensuring = null;

function resolveAlterSqlPath() {
  const candidates = [
    path.join(__dirname, '../../sql/alter-webhooks.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function ensureWebhooks() {
  if (ensured) return { created: false };
  if (ensuring) return ensuring;

  ensuring = (async () => {
    const sqlPath = resolveAlterSqlPath();
    if (sqlPath) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await query(sql);
    } else {
      await query(`
        CREATE TABLE IF NOT EXISTS webhook_endpoints (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret_encrypted TEXT NOT NULL,
          secret_prefix VARCHAR(16) NOT NULL,
          tables TEXT[] NOT NULL DEFAULT '{}',
          actions TEXT[] NOT NULL DEFAULT '{}',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          date_updated TIMESTAMPTZ
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id BIGSERIAL PRIMARY KEY,
          endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
          event_id UUID NOT NULL,
          table_name TEXT NOT NULL,
          action TEXT NOT NULL,
          record_id TEXT,
          payload JSONB NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 8,
          next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_http_status INTEGER,
          last_error TEXT,
          date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          date_delivered TIMESTAMPTZ
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_claim
          ON webhook_deliveries (status, next_attempt_at)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_created
          ON webhook_deliveries (endpoint_id, date_created DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_enabled
          ON webhook_endpoints (enabled)
          WHERE enabled = TRUE
      `);
    }
    ensured = true;
    return { created: true };
  })();

  try {
    return await ensuring;
  } finally {
    ensuring = null;
  }
}

function _resetEnsureFlag() {
  ensured = false;
}

module.exports = { ensureWebhooks, _resetEnsureFlag };
