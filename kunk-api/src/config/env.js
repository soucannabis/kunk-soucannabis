'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/** Allowlist of browser Origins. Empty / "true" → false (do not reflect any Origin). */
function parseCorsOrigin(value) {
  if (value === undefined || value === null || value === true) return false;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'true') return false;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length === 1) return parts[0];
  return parts;
}

/**
 * Preferência: PG_URL.
 * Fallback: PGHOST + PGUSER + PGPASSWORD + PGDATABASE (+ PGPORT opcional).
 */
function resolvePgUrl() {
  const pgUrl = String(process.env.PG_URL || '').trim();
  if (pgUrl) return pgUrl;

  const host = String(process.env.PGHOST || '').trim();
  const user = String(process.env.PGUSER || '').trim();
  const database = String(process.env.PGDATABASE || '').trim();
  const password = process.env.PGPASSWORD;
  const port = String(process.env.PGPORT || '5432').trim() || '5432';

  if (host && user && database && password !== undefined && password !== null && String(password) !== '') {
    return (
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(String(password))}` +
      `@${host}:${port}/${encodeURIComponent(database)}`
    );
  }

  return '';
}

const env = {
  port: Number(process.env.PORT || 8056),
  /** Connection string resolvida (PG_URL ou montada a partir de PG*). */
  pgUrl: resolvePgUrl(),
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  sessionMaxHours: Number(process.env.SESSION_MAX_HOURS || 168),
  storagePath: process.env.STORAGE_PATH || path.join(__dirname, '../../storage'),
  /** Active files driver default when DB config is empty: local | s3 | gcs */
  filesDriver: String(process.env.FILES_DRIVER || 'local').toLowerCase(),
  filesKeyPrefix: String(process.env.FILES_KEY_PREFIX || 'kunk/'),
  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  gcs: {
    bucket: process.env.GCS_BUCKET || '',
    projectId: process.env.GCS_PROJECT_ID || '',
    clientEmail: process.env.GCS_CLIENT_EMAIL || '',
    privateKey: process.env.GCS_PRIVATE_KEY || '',
    credentialsJson: process.env.GCS_CREDENTIALS_JSON || '',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Rate limit GET /users/exists and POST /auth/associate/register-email (5 / 15 min / IP). Set 0 for local e2e. */
  authEnumRateLimit: bool(process.env.AUTH_ENUM_RATE_LIMIT, true),
  /** Public base URL of doc-sign app (e.g. http://localhost:4258) for signing_url */
  docSignPublicUrl: String(process.env.DOC_SIGN_PUBLIC_URL || process.env.VITE_DOC_SIGN_URL || 'http://localhost:4258').replace(
    /\/$/,
    ''
  ),
  /** Master key for system_configs sensitive values (AES-256-GCM). Never stored in DB. */
  configEncryptKey: process.env.CONFIG_ENCRYPT_KEY || '',
  /** Public app URLs for e-mail links */
  publicUrls: {
    kunk: String(process.env.KUNK_PUBLIC_URL || process.env.PUBLIC_APP_URL || 'http://localhost:4257').replace(
      /\/$/,
      ''
    ),
    admin: String(process.env.ADMIN_PUBLIC_URL || 'http://localhost:4256').replace(/\/$/, ''),
    registration: String(
      process.env.REGISTRATION_PUBLIC_URL || process.env.CADASTRO_PUBLIC_URL || 'http://localhost:4255'
    ).replace(/\/$/, ''),
    docSign: String(process.env.DOC_SIGN_PUBLIC_URL || process.env.VITE_DOC_SIGN_URL || 'http://localhost:4258').replace(
      /\/$/,
      ''
    ),
  },
};

/** Alias legado para callers internos que ainda leem env.databaseUrl */
Object.defineProperty(env, 'databaseUrl', {
  enumerable: true,
  get() {
    return env.pgUrl;
  },
});

module.exports = { env, resolvePgUrl, parseCorsOrigin };
