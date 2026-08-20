-- Webhooks outbound configuráveis (Admin).
-- Outbox + endpoints. Idempotent.

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_claim
  ON webhook_deliveries (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_created
  ON webhook_deliveries (endpoint_id, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_enabled
  ON webhook_endpoints (enabled)
  WHERE enabled = TRUE;
