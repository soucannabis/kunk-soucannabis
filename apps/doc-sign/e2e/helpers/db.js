import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDatabaseUrl() {
  if (process.env.PG_URL) return process.env.PG_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.resolve(__dirname, '../../../../kunk-api/.env');
  const fileEnv = parseEnvFile(envPath);
  if (fileEnv.PG_URL) return fileEnv.PG_URL;
  if (fileEnv.DATABASE_URL) return fileEnv.DATABASE_URL;

  const host = process.env.PGHOST || fileEnv.PGHOST;
  const user = process.env.PGUSER || fileEnv.PGUSER;
  const password = process.env.PGPASSWORD ?? fileEnv.PGPASSWORD;
  const database = process.env.PGDATABASE || fileEnv.PGDATABASE;
  const port = process.env.PGPORT || fileEnv.PGPORT || '5432';
  if (host && user && database && password != null && password !== '') {
    return (
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(String(password))}` +
      `@${host}:${port}/${encodeURIComponent(database)}`
    );
  }
  return null;
}

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = loadDatabaseUrl();
    if (!connectionString) return null;
    pool = new pg.Pool({ connectionString });
  }
  return pool;
}

async function hashPassword(password) {
  const authRepository = require('../../../../kunk-api/src/repositories/authRepository.js');
  return authRepository.hashPassword(password);
}

export async function ensureAdminUser() {
  const email = process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test';
  const password = process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!';
  const p = getPool();
  if (!p) return { email, password };
  const hash = await hashPassword(password);
  const existing = await p.query(`SELECT id FROM system_users WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    await p.query(`DELETE FROM operator_sessions WHERE user_id = $1`, [existing.rows[0].id]).catch(() => {});
    await p.query(
      `UPDATE system_users SET password = $1, permissions = $2, status = 'active',
        session_token = NULL, is_session_active = false WHERE id = $3`,
      [hash, JSON.stringify(['Administrador']), existing.rows[0].id]
    );
  } else {
    await p.query(
      `INSERT INTO system_users (email, password, name, last_name, permissions, status, internal_code, date_created)
       VALUES ($1,$2,'Admin','Test',$3,'active','ADMIN-TEST',NOW())`,
      [email, hash, JSON.stringify(['Administrador'])]
    );
  }
  return { email, password };
}

const DOC_SIGN_E2E_ASSOCIATION = {
  VITE_ASSOCIATION_NAME: 'E2E Doc-sign Assoc',
  VITE_ASSOCIATION_FULL_NAME: 'ASSOCIACAO E2E DOC SIGN TESTE',
  VITE_ASSOCIATION_EMAIL: 'contato-docsign-e2e@test.local',
  VITE_ASSOCIATION_PHONE: '11999998888',
  VITE_ASSOCIATION_SITE: 'www.docsign-e2e.test',
  VITE_ASSOCIATION_CNPJ: '11222333000181',
  VITE_ASSOCIATION_CITY: 'Sao Paulo',
  VITE_ASSOCIATION_STATE: 'SP',
};

/** Preenche campos obrigatórios de Dados da associação para liberar login no doc-sign. */
export async function ensureAssociationData() {
  const p = getPool();
  if (!p) return;
  for (const [key, value] of Object.entries(DOC_SIGN_E2E_ASSOCIATION)) {
    await p.query(
      `INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, description)
       VALUES ('registration', $1, $2, 'string', false, true, 'e2e doc-sign')
       ON CONFLICT (system, key)
       DO UPDATE SET value = EXCLUDED.value, date_updated = NOW()`,
      [key, value]
    );
  }
}

export async function prepareDocSignE2e() {
  await ensureAdminUser();
  await ensureAssociationData();
}
