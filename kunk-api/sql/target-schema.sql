-- Schema alvo Kunk open source (PostgreSQL)
-- Gerado/ajustado para importação: ordem de FKs corrigida; coluna "user" entre aspas.
-- Não executar em produção sem revisão.

-- Tabela de arquivos do produto
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY,
  filename VARCHAR(512),
  mime_type VARCHAR(128),
  storage_path TEXT,
  storage_driver VARCHAR(16) NOT NULL DEFAULT 'local',
  storage_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- Users → users (antes de orders por causa da FK)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  status VARCHAR(255),
  sort INTEGER,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  associate_name VARCHAR(255),
  associate_last_name VARCHAR(255),
  gender VARCHAR(255),
  nationality VARCHAR(255),
  associate_rg_issuer VARCHAR(255),
  marital_status VARCHAR(255),
  street VARCHAR(255),
  street_number VARCHAR(255),
  complement VARCHAR(255),
  neighborhood VARCHAR(255),
  proof_of_address VARCHAR(255),
  reason_treatment_text TEXT,
  responsible_type VARCHAR(255),
  city VARCHAR(255),
  state VARCHAR(255),
  cep VARCHAR(255),
  email_account VARCHAR(255),
  account_password VARCHAR(255),
  user_code UUID UNIQUE,
  rg_proof VARCHAR(255),
  associate_cpf VARCHAR(255),
  associate_rg VARCHAR(255),
  mobile_number VARCHAR(255),
  associate_status VARCHAR(64),
  prescription VARCHAR(255),
  responsible_code UUID,
  documents_folder_id VARCHAR(255),
  rg_patient_proof VARCHAR(255),
  patient_user_code VARCHAR(255),
  adhesion_term UUID,
  invalid_fields TEXT,
  ciap_codes TEXT,
  associate_birth_date VARCHAR(255),
  preferred_products VARCHAR(255),
  date_prescription DATE,
  annotations TEXT,
  handbook TEXT,
  created_date TIMESTAMP,
  avatar_url VARCHAR(255),
  prescriber VARCHAR(255),
  delivery_address JSONB,
  prescriber_code VARCHAR(255),
  session_token VARCHAR(255),
  session_expires TIMESTAMP,
  last_activity TIMESTAMP,
  is_session_active BOOLEAN,
  fullname VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_users_responsible_code FOREIGN KEY (responsible_code) REFERENCES users(user_code) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_account_login_uidx
  ON users (lower(btrim(email_account)))
  WHERE email_account IS NOT NULL
    AND btrim(email_account) <> ''
    AND (status IS NULL OR status <> 'patient');

-- system_users (operadores do painel; ex-Kunk_Users / kunk_users)
CREATE TABLE IF NOT EXISTS system_users (
  id SERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  name VARCHAR(255),
  last_name VARCHAR(255),
  status VARCHAR(255),
  user_code UUID,
  permissions VARCHAR(255),
  email VARCHAR(255),
  password VARCHAR(255),
  cpf VARCHAR(255),
  rg VARCHAR(255),
  birth_date VARCHAR(255),
  gender VARCHAR(255),
  nationality VARCHAR(255),
  marital_status VARCHAR(255),
  mobile_number VARCHAR(255),
  street VARCHAR(255),
  neighborhood VARCHAR(255),
  city VARCHAR(255),
  state VARCHAR(255),
  cep VARCHAR(255),
  pix_key VARCHAR(255),
  commission_value VARCHAR(255),
  transactions VARCHAR(255),
  commission_total VARCHAR(255),
  avatar_url VARCHAR(255),
  utalk_id VARCHAR(255),
  utalk_token TEXT,
  session_token VARCHAR(255),
  session_expires TIMESTAMP,
  last_activity TIMESTAMP,
  is_session_active BOOLEAN,
  internal_code VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- Sessões de operador por app (admin | kunk | doc-sign)
CREATE TABLE IF NOT EXISTS operator_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  app VARCHAR(32) NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  session_expires TIMESTAMP NOT NULL,
  last_activity TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, app)
);

-- Institutional clients → institutional_clients
CREATE TABLE IF NOT EXISTS institutional_clients (
  id SERIAL PRIMARY KEY,
  client_code UUID UNIQUE NOT NULL,
  status VARCHAR(255) NOT NULL DEFAULT 'active',
  sort INTEGER,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  annotations JSONB,
  is_company BOOLEAN NOT NULL DEFAULT false,
  company_name VARCHAR(255),
  company_trade_name VARCHAR(255),
  company_cnpj VARCHAR(255),
  company_email VARCHAR(255),
  company_phone VARCHAR(255),
  representative_name VARCHAR(255) NOT NULL,
  representative_last_name VARCHAR(255),
  representative_cpf VARCHAR(255) NOT NULL,
  representative_email VARCHAR(255),
  representative_mobile VARCHAR(255),
  street VARCHAR(255),
  street_number VARCHAR(255),
  complement VARCHAR(255),
  neighborhood VARCHAR(255),
  city VARCHAR(255),
  state VARCHAR(255),
  cep VARCHAR(255),
  delivery_address JSONB,
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- Orders → orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  sort INTEGER,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  status VARCHAR(255),
  total REAL,
  payment_method VARCHAR(255),
  tracking_code VARCHAR(255),
  delivery_price REAL,
  associate_name VARCHAR(255),
  receiver_name VARCHAR(255),
  order_code UUID,
  user_code VARCHAR(255),
  items JSONB,
  created_date TIMESTAMP,
  discount REAL,
  details TEXT,
  donation REAL,
  prescriber VARCHAR(255),
  payment_link TEXT,
  "user" INTEGER,
  institutional_client_id INTEGER,
  institutional_client_code VARCHAR(255),
  carrier_order_code VARCHAR(255),
  payment_code TEXT,
  order_notes TEXT,
  tags JSONB,
  delivery_notes TEXT,
  address JSONB,
  whatsapp_message VARCHAR(255),
  prescriber_code VARCHAR(255),
  payment_date TIMESTAMP,
  custom_payment JSONB,
  production_owner VARCHAR(255),
  tracking_code_date TIMESTAMP,
  last_tracking_date TIMESTAMP,
  address_validation VARCHAR(255),
  created_by_user_code VARCHAR(255),
  freight_carrier VARCHAR(32),
  freight_option JSONB,
  dce JSONB,
  stock_debited_at TIMESTAMPTZ,
  soucannabis_order_id VARCHAR(64),
  soucannabis_synced_at TIMESTAMPTZ,
  soucannabis_sync_error TEXT,
  external_payment_info JSONB,
  external_delivery_type VARCHAR(32),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_orders_user FOREIGN KEY ("user") REFERENCES users(id),
  CONSTRAINT fk_orders_institutional_client FOREIGN KEY (institutional_client_id) REFERENCES institutional_clients(id)
);

-- Orders_files → orders_files
CREATE TABLE IF NOT EXISTS orders_files (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  file_id UUID,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_orders_files_order_id FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_orders_files_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Products → products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  status VARCHAR(255) NOT NULL,
  sort INTEGER,
  user_created UUID,
  date_created TIMESTAMPTZ,
  user_updated UUID,
  date_updated TIMESTAMPTZ,
  name VARCHAR(255),
  sku VARCHAR(255),
  type VARCHAR(255),
  unit VARCHAR(255),
  concentration INTEGER,
  price REAL,
  amount INTEGER,
  category VARCHAR(255),
  photo UUID,
  batch VARCHAR(255),
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- Product stock movements (histórico de uso / ajustes)
CREATE TABLE IF NOT EXISTS product_stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  order_id INTEGER REFERENCES orders(id),
  quantity INTEGER NOT NULL,
  kind VARCHAR(32) NOT NULL,
  note TEXT,
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_psm_product ON product_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_psm_order ON product_stock_movements(order_id);

-- Professionals → professionals
CREATE TABLE IF NOT EXISTS professionals (
  id SERIAL PRIMARY KEY,
  sort INTEGER,
  date_created TIMESTAMPTZ,
  name VARCHAR(255),
  last_name VARCHAR(255),
  type VARCHAR(255),
  services_description VARCHAR(255),
  phone VARCHAR(255),
  state VARCHAR(255),
  city VARCHAR(255),
  cpf VARCHAR(255),
  email VARCHAR(255),
  specialty VARCHAR(255),
  active INTEGER,
  is_prescriber VARCHAR(255),
  is_collaborator VARCHAR(255),
  professional_code UUID UNIQUE,
  fingerprint VARCHAR(255),
  contest_reports JSONB,
  met_us VARCHAR(255),
  recipient_id VARCHAR(255),
  donation_balance INTEGER,
  calendar_id VARCHAR(255),
  consultation_price NUMERIC(12, 2) DEFAULT 0,
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- Reception → reception
CREATE TABLE IF NOT EXISTS reception (
  id SERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ,
  name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  help_topic VARCHAR(255),
  is_associate VARCHAR(255),
  message TEXT,
  code UUID,
  chat_id VARCHAR(255),
  status VARCHAR(255),
  associate_name VARCHAR(255),
  associate_code VARCHAR(255),
  date_updated TIMESTAMP,
  avatar_url VARCHAR(255),
  patient_name VARCHAR(255),
  attendant VARCHAR(255),
  tags JSONB,
  completion_reason VARCHAR(255),
  is_prescriber VARCHAR(255),
  full_name VARCHAR(255),
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- reports → reports
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  name VARCHAR(255),
  report_code UUID,
  query_config JSONB,
  sql_query TEXT,
  type VARCHAR(255),
  dashboard_queries JSONB,
  layout_positions JSONB,
  chart_config JSONB,
  created_by VARCHAR(255),
  tags JSONB,
  column_maps JSONB,
  embedded_report_codes JSONB,
  favorites JSONB,
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- services → services
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  sort INTEGER,
  type VARCHAR(255),
  date_created TIMESTAMPTZ,
  name VARCHAR(255),
  professional_id UUID,
  status VARCHAR(255),
  price INTEGER,
  associate_name VARCHAR(255),
  associate_user_code UUID,
  associate_email VARCHAR(255),
  professional_name VARCHAR(255),
  event_link VARCHAR(255),
  consultation_date TIMESTAMP,
  payment_link VARCHAR(255),
  event_id VARCHAR(255),
  price_paid REAL,
  donation REAL,
  booking_group_code VARCHAR(255),
  patient_name VARCHAR(255),
  patient_user_code UUID,
  professional_email VARCHAR(255),
  service_code UUID,
  observations TEXT,
  payment_type VARCHAR(255),
  tags JSONB,
  created_by_user_code VARCHAR(255),
  payment_code TEXT,
  payment_info JSONB,
  commission_validation VARCHAR(32),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_services_professional_id FOREIGN KEY (professional_id) REFERENCES professionals(professional_code) ON DELETE SET NULL,
  CONSTRAINT fk_services_associate_user_code FOREIGN KEY (associate_user_code) REFERENCES users(user_code) ON DELETE SET NULL,
  CONSTRAINT fk_services_patient_user_code FOREIGN KEY (patient_user_code) REFERENCES users(user_code) ON DELETE SET NULL
);

-- services_files → services_files
CREATE TABLE IF NOT EXISTS services_files (
  id SERIAL PRIMARY KEY,
  service_id INTEGER,
  file_id UUID,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_services_files_service_id FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_services_files_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Tags → tags
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  tag VARCHAR(255),
  contexts VARCHAR(255),
  color VARCHAR(255),
  is_sample BOOLEAN NOT NULL DEFAULT false
);

-- System configs (per-system runtime env overrides; not exposed via /items)
CREATE TABLE IF NOT EXISTS system_configs (
  id SERIAL PRIMARY KEY,
  system VARCHAR(64) NOT NULL,
  key VARCHAR(128) NOT NULL,
  value TEXT,
  value_type VARCHAR(32) NOT NULL DEFAULT 'string',
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  allow_hardcoded BOOLEAN NOT NULL DEFAULT true,
  hardcoded_default TEXT,
  description TEXT,
  date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_updated TIMESTAMP,
  UNIQUE (system, key)
);

-- system_api_credentials: encrypted API secrets for external integrations
CREATE TABLE IF NOT EXISTS system_api_credentials (
  id SERIAL PRIMARY KEY,
  service VARCHAR(64) NOT NULL,
  field_key VARCHAR(128) NOT NULL,
  encrypted_value TEXT,
  env_fallback VARCHAR(128),
  is_secret BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_updated TIMESTAMPTZ,
  UNIQUE (service, field_key)
);

CREATE INDEX IF NOT EXISTS idx_system_api_credentials_service
  ON system_api_credentials (service);

-- system_activity: operator action audit log
CREATE TABLE IF NOT EXISTS system_activity (
  id SERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_code TEXT,
  action TEXT NOT NULL,
  actor_user_code TEXT,
  actor_name TEXT,
  related_user_code TEXT,
  related_user_name TEXT,
  summary TEXT NOT NULL,
  metadata JSONB,
  read_by JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_activity_date_created
  ON system_activity (date_created DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_entity
  ON system_activity (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_system_activity_related
  ON system_activity (related_user_code, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_actor
  ON system_activity (actor_user_code, date_created DESC);

-- system_errors: native error observability events
CREATE TABLE IF NOT EXISTS system_errors (
  id BIGSERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_hash CHAR(64) NOT NULL,
  source TEXT NOT NULL,
  app TEXT,
  severity TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  code TEXT,
  file_name TEXT,
  lineno INT,
  colno INT,
  stack_trace TEXT,
  url TEXT,
  method TEXT,
  status_code INT,
  user_code TEXT,
  user_agent TEXT,
  request_id TEXT,
  environment TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_system_errors_hash_created
  ON system_errors (error_hash, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_system_errors_created
  ON system_errors (date_created DESC);

CREATE INDEX IF NOT EXISTS idx_system_errors_source
  ON system_errors (source, date_created DESC);

-- system_error_resolutions: per-hash triage status
CREATE TABLE IF NOT EXISTS system_error_resolutions (
  error_hash CHAR(64) PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT
);

-- web_vitals: Core Web Vitals / performance metrics from frontends
CREATE TABLE IF NOT EXISTS web_vitals (
  id BIGSERIAL PRIMARY KEY,
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  rating TEXT,
  delta DOUBLE PRECISION,
  navigation_type TEXT,
  app TEXT,
  url TEXT,
  path TEXT,
  user_code TEXT,
  user_agent TEXT,
  connection_type TEXT,
  device_memory DOUBLE PRECISION,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_created
  ON web_vitals (date_created DESC);

CREATE INDEX IF NOT EXISTS idx_web_vitals_name_created
  ON web_vitals (name, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_web_vitals_path_name
  ON web_vitals (path, name, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_web_vitals_app
  ON web_vitals (app, date_created DESC);

-- Users_Api → users_api
CREATE TABLE IF NOT EXISTS users_api (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  token VARCHAR(255),
  token_prefix VARCHAR(32),
  scopes JSONB NOT NULL DEFAULT '["*"]'::jsonb,
  is_sample BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS users_api_token_prefix_uidx
  ON users_api (token_prefix);

-- Users_files → users_files
CREATE TABLE IF NOT EXISTS users_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  file_id UUID,
  doc_type VARCHAR(32),
  side VARCHAR(16),
  subject VARCHAR(32),
  doc_kind VARCHAR(32),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_users_files_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_users_files_file_id FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Doc-sign (termos / assinaturas)
CREATE TABLE IF NOT EXISTS term_templates (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  requires_patient BOOLEAN NOT NULL DEFAULT false,
  draft_content_json JSONB,
  logo_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  current_version_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS term_template_versions (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES term_templates(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content_json JSONB NOT NULL,
  content_sha256 TEXT NOT NULL,
  pdf_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  pdf_sha256 TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT NULL,
  UNIQUE (template_id, version_number)
);

CREATE TABLE IF NOT EXISTS term_contracts (
  id UUID PRIMARY KEY,
  user_code UUID NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  template_version_id UUID NOT NULL REFERENCES term_template_versions(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  filled_pdf_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  signed_pdf_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  audit_pdf_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  filled_pdf_sha256 TEXT NULL,
  signed_pdf_sha256 TEXT NULL,
  signing_token_hash TEXT NOT NULL,
  signing_token_expires TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS term_signatures (
  id UUID PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES term_contracts(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  typed_name TEXT NULL,
  image_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS term_events (
  id UUID PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES term_contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_email TEXT NULL,
  actor_name TEXT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  timezone TEXT NULL,
  meta JSONB NULL
);
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
