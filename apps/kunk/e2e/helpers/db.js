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

async function upsertUser({ email, password, permissions, name, lastName, code }) {
  const p = getPool();
  if (!p) return { email, password };
  const hash = await hashPassword(password);
  const existing = await p.query(`SELECT id FROM system_users WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    await p.query(`DELETE FROM operator_sessions WHERE user_id = $1`, [existing.rows[0].id]).catch(() => {});
    await p.query(
      `UPDATE system_users
       SET password = $1,
           permissions = $2,
           status = 'active',
           name = COALESCE($3, name),
           last_name = COALESCE($4, last_name),
           internal_code = COALESCE($5, internal_code),
           session_token = NULL,
           is_session_active = false
       WHERE id = $6`,
      [hash, JSON.stringify(permissions), name || null, lastName || null, code || null, existing.rows[0].id]
    );
  } else {
    await p.query(
      `INSERT INTO system_users (email, password, name, last_name, permissions, status, internal_code, date_created)
       VALUES ($1,$2,$3,$4,$5,'active',$6,NOW())`,
      [email, hash, name, lastName, JSON.stringify(permissions), code]
    );
  }
  return { email, password };
}

export async function ensureAdminUser() {
  return upsertUser({
    email: process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test',
    password: process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!',
    permissions: ['Administrador'],
    name: 'Admin',
    lastName: 'Test',
    code: 'ADMIN-TEST',
  });
}

export async function ensureDemoAdminUser() {
  return upsertUser({
    email: 'admin@example.test',
    password: 'Admin@2026!',
    permissions: ['Administrador'],
    name: 'Administrador',
    lastName: 'Sou Cannabis',
    code: 'ADMIN-SOUCANNABIS',
  });
}

/** Garante tema claro do formulário público de triagem (para demos que clicam em Padrão escuro). */
export async function ensureTriageFormThemeLight() {
  const p = getPool();
  if (!p) return;
  const system = 'triage';
  const key = 'triage.form.theme';
  const existing = await p.query(
    `SELECT id, value FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [system, key]
  );
  if (existing.rows[0]?.id) {
    if (String(existing.rows[0].value || '').toLowerCase() !== 'light') {
      await p.query(
        `UPDATE system_configs SET value = 'light', date_updated = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
    }
    return;
  }
  await p.query(
    `INSERT INTO system_configs
      (system, key, value, value_type, is_sensitive, is_required, allow_hardcoded, hardcoded_default, description, date_created)
     VALUES ($1, $2, 'light', 'string', false, false, true, 'dark',
             'Tema visual do formulário público de triagem (dark|light)', NOW())`,
    [system, key]
  );
}

/** Snapshot JSON dos tipos de profissional em system_configs. */
export async function snapshotProfessionalTypes() {
  const p = getPool();
  if (!p) return null;
  const { rows } = await p.query(
    `SELECT value FROM system_configs WHERE system = 'services' AND key = 'professional_types' LIMIT 1`
  );
  const raw = rows[0]?.value;
  if (raw == null || raw === '') return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** Restaura o catálogo de tipos (ex.: taxas aplicadas na demo). */
export async function restoreProfessionalTypes(types) {
  if (!Array.isArray(types)) return;
  const p = getPool();
  if (!p) return;
  const serialized = JSON.stringify(types);
  const existing = await p.query(
    `SELECT id FROM system_configs WHERE system = 'services' AND key = 'professional_types' LIMIT 1`
  );
  if (existing.rows[0]?.id) {
    await p.query(
      `UPDATE system_configs SET value = $1, date_updated = NOW() WHERE id = $2`,
      [serialized, existing.rows[0].id]
    );
    return;
  }
  await p.query(
    `INSERT INTO system_configs
      (system, key, value, value_type, is_sensitive, is_required, allow_hardcoded, description, date_created)
     VALUES ('services', 'professional_types', $1, 'json', false, false, false,
             'Catálogo de tipos de profissional (taxa / preço padrão)', NOW())`,
    [serialized]
  );
}

/** Garante api.enabled = false (para demos que clicam em Habilitar + Salvar). */
export async function ensureApiAccessDisabled() {
  const p = getPool();
  if (!p) return;
  const system = 'api';
  const key = 'api.enabled';
  const existing = await p.query(
    `SELECT id, value FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [system, key]
  );
  if (existing.rows[0]?.id) {
    if (String(existing.rows[0].value || '').toLowerCase() !== 'false') {
      await p.query(
        `UPDATE system_configs SET value = 'false', date_updated = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
    }
    return;
  }
  await p.query(
    `INSERT INTO system_configs
      (system, key, value, value_type, is_sensitive, is_required, allow_hardcoded, hardcoded_default, description, date_created)
     VALUES ($1, $2, 'false', 'boolean', false, false, true, 'false',
             'Habilita autenticação Bearer e gestão de tokens de API no Admin', NOW())`,
    [system, key]
  );
}

export async function ensureAcolhimentoUser() {
  return upsertUser({
    email: process.env.E2E_ACOL_EMAIL || 'acolhimento@kunk-api.test',
    password: process.env.E2E_ACOL_PASSWORD || 'TestAcol123!',
    permissions: ['Acolhimento'],
    name: 'Acol',
    lastName: 'Test',
    code: 'ACOL-TEST',
  });
}

export async function ensureFinanceiroUser() {
  return upsertUser({
    email: 'financeiro@kunk-api.test',
    password: 'TestFinanceiro123!',
    permissions: ['Financeiro'],
    name: 'Financeiro',
    lastName: 'Test',
    code: 'FIN-TEST',
  });
}

/**
 * Garante login de profissional vinculado a `professionals.professional_code`
 * via `system_users.internal_code` (portal /relatorio/servicos).
 */
export async function ensureProfessionalUser({
  email = process.env.DEMO_PROFESSIONAL_EMAIL || 'profissional@example.test',
  password = process.env.DEMO_PROFESSIONAL_PASSWORD || 'Marina@2026!',
  name = 'Marina',
  lastName = 'Oliveira',
} = {}) {
  const p = getPool();
  if (!p) return { email, password };
  const { rows } = await p.query(
    `SELECT professional_code, name, last_name, email
     FROM professionals
     WHERE lower(email) = lower($1)
        OR (name ILIKE $2 AND last_name ILIKE $3)
     ORDER BY CASE WHEN lower(email) = lower($1) THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [email, name, lastName]
  );
  const pro = rows[0];
  if (!pro?.professional_code) {
    throw new Error(`Profissional não encontrado para ${email} / ${name} ${lastName}`);
  }
  return upsertUser({
    email,
    password,
    permissions: ['Profissional'],
    name: pro.name || name,
    lastName: pro.last_name || lastName,
    code: String(pro.professional_code),
  });
}
