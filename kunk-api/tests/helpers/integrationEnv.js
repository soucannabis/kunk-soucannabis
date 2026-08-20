'use strict';

const request = require('supertest');
const { query } = require('./db');
const { TINY_PNG } = require('./fileBuffers');

const MODULE_SERVICES = [
  'pagarme',
  'soucannabis_orders',
  'loggi',
  'melhorenvio',
  'email',
];

function moduleEnabledKey(service) {
  return `modules.${service}.enabled`;
}

function isSharedProductionDb() {
  const pgUrl = String(process.env.PG_URL || process.env.DATABASE_URL || '').trim();
  if (pgUrl && !/localhost|127\.0\.0\.1/i.test(pgUrl)) return true;
  const pgHost = String(process.env.PGHOST || '').trim();
  if (pgHost && !/localhost|127\.0\.0\.1/i.test(pgHost)) return true;
  return false;
}

async function readModuleFlag(service) {
  const key = moduleEnabledKey(service);
  const res = await query(
    `SELECT value FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [key]
  );
  return res.rows[0]?.value ?? null;
}

async function setModuleFlag(service, enabled) {
  const key = moduleEnabledKey(service);
  await query(
    `INSERT INTO system_configs (system, key, value, value_type, is_sensitive, allow_hardcoded, description)
     VALUES ('modules', $1, $2, 'boolean', false, false, 'integration test toggle')
     ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value`,
    [key, enabled ? 'true' : 'false']
  );
}

async function setModuleFlags(flags = {}) {
  for (const [service, enabled] of Object.entries(flags)) {
    await setModuleFlag(service, Boolean(enabled));
  }
}

async function snapshotModuleFlags(services = MODULE_SERVICES) {
  const snapshot = {};
  for (const service of services) {
    snapshot[service] = await readModuleFlag(service);
  }
  return snapshot;
}

async function restoreModuleFlags(snapshot = {}) {
  for (const [service, value] of Object.entries(snapshot)) {
    if (value == null) {
      await query(
        `DELETE FROM system_configs WHERE system = 'modules' AND key = $1`,
        [moduleEnabledKey(service)]
      );
    } else {
      await setModuleFlag(service, value === 'true' || value === true);
    }
  }
}

/**
 * Isola suites que precisam de módulos desligados (estoque local, PAYMENT_LOCK off).
 * Retorna { restore } para chamar no after().
 */
async function isolatePaymentModules() {
  const snapshot = await snapshotModuleFlags(['pagarme', 'soucannabis_orders']);
  await setModuleFlags({ pagarme: false, soucannabis_orders: false });
  return {
    async restore() {
      await restoreModuleFlags(snapshot);
    },
  };
}

function paymentBypassBody(status) {
  return {
    status,
    skip_payment_lock: true,
    force_test_paid: true,
  };
}

async function tableExists(tableName) {
  const safe = String(tableName).replace(/[^a-z0-9_]/gi, '');
  const res = await query(`SELECT to_regclass($1) AS reg`, [`public.${safe}`]);
  return Boolean(res.rows[0]?.reg);
}

async function skipIfMissingTable(tableName) {
  return !(await tableExists(tableName));
}

/** CPF válido único por execução (evita colisão com sample data em PG compartilhado). */
function uniqueValidCpf() {
  const base = String(Date.now()).slice(-9).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(base[i]) * (10 - i);
  }
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;

  sum = 0;
  const withD1 = base + d1;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(withD1[i]) * (11 - i);
  }
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;

  const digits = base + String(d1) + String(d2);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

async function ensureDocSignLogo(app, cookie, kind) {
  const upload = await request(app)
    .post('/api/v1/files')
    .set('Cookie', cookie)
    .attach('file', TINY_PNG, { filename: 'doc-sign-logo.png', contentType: 'image/png' });
  if (upload.status !== 201) {
    throw new Error(`Logo upload failed: ${JSON.stringify(upload.body)}`);
  }
  const logoFileId = upload.body.data.id;

  const draft = await request(app)
    .put(`/api/v1/doc-sign/templates/${kind}/draft`)
    .set('Cookie', cookie)
    .send({ logo_file_id: logoFileId });
  if (draft.status !== 200) {
    throw new Error(`Draft logo attach failed: ${JSON.stringify(draft.body)}`);
  }
  return logoFileId;
}

async function repairCorruptEmailCredentials() {
  const rows = await query(
    `SELECT field_key, encrypted_value FROM system_api_credentials WHERE service = 'email' AND encrypted_value IS NOT NULL`
  );
  if (!rows.rows.length) return;
  const { decryptValue } = require('../../src/services/credentialsService');
  for (const row of rows.rows) {
    try {
      decryptValue(row.encrypted_value);
    } catch {
      await query(
        `UPDATE system_api_credentials
         SET encrypted_value = NULL, last_test_ok = NULL, last_tested_at = NULL
         WHERE service = 'email' AND field_key = $1`,
        [row.field_key]
      );
    }
  }
}

module.exports = {
  MODULE_SERVICES,
  isSharedProductionDb,
  readModuleFlag,
  setModuleFlag,
  setModuleFlags,
  snapshotModuleFlags,
  restoreModuleFlags,
  isolatePaymentModules,
  paymentBypassBody,
  tableExists,
  skipIfMissingTable,
  uniqueValidCpf,
  ensureDocSignLogo,
  repairCorruptEmailCredentials,
};
