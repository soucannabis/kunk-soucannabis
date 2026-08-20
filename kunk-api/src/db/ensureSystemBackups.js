'use strict';

const { query } = require('./pool');

const STORAGE_CONFIG_DEFAULTS = [
  {
    key: 'driver',
    value_type: 'string',
    hardcoded_default: 'local',
    description: 'Driver ativo: local | s3 | gcs (ENV: FILES_DRIVER)',
  },
  {
    key: 'key_prefix',
    value_type: 'string',
    hardcoded_default: 'kunk/',
    description: 'Prefixo das object keys no bucket (ENV: FILES_KEY_PREFIX)',
  },
  {
    key: 'locked',
    value_type: 'boolean',
    hardcoded_default: 'false',
    description: 'Se true, impede trocar provedor/bucket após migração',
  },
  {
    key: 's3.bucket',
    value_type: 'string',
    hardcoded_default: '',
    description: 'Nome do bucket S3 (ENV: S3_BUCKET)',
  },
  {
    key: 's3.region',
    value_type: 'string',
    hardcoded_default: 'us-east-1',
    description: 'Região S3 (ENV: S3_REGION)',
  },
  {
    key: 'gcs.bucket',
    value_type: 'string',
    hardcoded_default: '',
    description: 'Nome do bucket GCS (ENV: GCS_BUCKET)',
  },
  {
    key: 'gcs.project_id',
    value_type: 'string',
    hardcoded_default: '',
    description: 'GCP project id (ENV: GCS_PROJECT_ID)',
  },
  {
    key: 'backup.enabled',
    value_type: 'boolean',
    hardcoded_default: 'false',
    description: 'Se true, backups diários estão ativos (somente com bucket cloud locked)',
  },
  {
    key: 'backup.schedule_time',
    value_type: 'string',
    hardcoded_default: '22:00',
    description: 'Horário diário do backup (HH:MM) no fuso backup.timezone',
  },
  {
    key: 'backup.timezone',
    value_type: 'string',
    hardcoded_default: 'America/Sao_Paulo',
    description: 'Fuso horário IANA do agendamento de backup',
  },
  {
    key: 'backup.retention_count',
    value_type: 'number',
    hardcoded_default: '10',
    description: 'Quantidade máxima de backups a reter no bucket',
  },
];

const STORAGE_CREDENTIAL_DEFAULTS = [
  {
    service: 'storage_s3',
    field_key: 'access_key_id',
    env_fallback: 'S3_ACCESS_KEY_ID',
    description: 'AWS Access Key ID (ou compatível S3)',
  },
  {
    service: 'storage_s3',
    field_key: 'secret_access_key',
    env_fallback: 'S3_SECRET_ACCESS_KEY',
    description: 'AWS Secret Access Key',
  },
  {
    service: 'storage_gcs',
    field_key: 'client_email',
    env_fallback: 'GCS_CLIENT_EMAIL',
    description: 'Service account client_email',
  },
  {
    service: 'storage_gcs',
    field_key: 'private_key',
    env_fallback: 'GCS_PRIVATE_KEY',
    description: 'Service account private_key (PEM; \\n escapados)',
  },
  {
    service: 'storage_gcs',
    field_key: 'credentials_json',
    env_fallback: 'GCS_CREDENTIALS_JSON',
    description: 'JSON completo da service account (alternativa a email+key)',
  },
];

async function ensureStorageConfigRows() {
  for (const row of STORAGE_CONFIG_DEFAULTS) {
    await query(
      `INSERT INTO system_configs (
         system, key, value, value_type, is_sensitive, is_required,
         allow_hardcoded, hardcoded_default, description
       ) VALUES (
         'storage', $1, NULL, $2, false, false, true, $3, $4
       )
       ON CONFLICT (system, key) DO NOTHING`,
      [row.key, row.value_type, row.hardcoded_default, row.description]
    );
  }
}

async function ensureStorageCredentialRows() {
  for (const row of STORAGE_CREDENTIAL_DEFAULTS) {
    await query(
      `INSERT INTO system_api_credentials (
         service, field_key, encrypted_value, env_fallback, is_secret, description
       ) VALUES (
         $1, $2, NULL, $3, true, $4
       )
       ON CONFLICT (service, field_key) DO NOTHING`,
      [row.service, row.field_key, row.env_fallback, row.description]
    );
  }
}

/**
 * Garante keys de storage/backup, metadados de credenciais e tabela system_backups.
 */
async function ensureSystemBackups() {
  await ensureStorageConfigRows();
  await ensureStorageCredentialRows();

  await query(`
    CREATE TABLE IF NOT EXISTS system_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(32) NOT NULL DEFAULT 'running',
      prefix TEXT,
      sql_key TEXT,
      json_key TEXT,
      size_bytes BIGINT,
      error TEXT,
      triggered_by VARCHAR(32) NOT NULL DEFAULT 'manual'
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS system_backups_created_at_idx
      ON system_backups (created_at DESC)
  `);

  return { ok: true };
}

module.exports = {
  ensureSystemBackups,
  ensureStorageConfigRows,
  ensureStorageCredentialRows,
  STORAGE_CONFIG_DEFAULTS,
  STORAGE_CREDENTIAL_DEFAULTS,
  BACKUP_CONFIG_DEFAULTS: STORAGE_CONFIG_DEFAULTS.filter((r) => r.key.startsWith('backup.')),
};
