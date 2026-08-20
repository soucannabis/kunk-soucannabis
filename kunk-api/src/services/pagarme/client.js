'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');

const DEFAULT_API_BASE = 'https://api.pagar.me/core/v5';
const TEST_API_BASE = 'https://sdx-api.pagar.me/core/v5';

async function resolveConfig(credsOverride = null) {
  const resolved = credsOverride || (await credentialsService.resolveAll('pagarme'));
  const secretKey =
    String(resolved.secret_key || process.env.PAGARME_SECRET_KEY || process.env.PAGARME_TOKEN || '').trim();
  const apiBase = String(resolved.api_base_url || process.env.PAGARME_URL_API || DEFAULT_API_BASE)
    .trim()
    .replace(/\/$/, '');
  const publicKey = String(resolved.public_key || process.env.PAGARME_PUBLIC_KEY || '').trim() || null;
  return { secretKey, apiBase, publicKey, raw: resolved };
}

function authHeader(secretKey) {
  const token = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

function getPaymentLinksApiBase(secretKey, apiBase) {
  return /^sk_test_/i.test(secretKey) ? TEST_API_BASE : apiBase;
}

async function paymentLinksApiBase(credsOverride = null) {
  const { secretKey, apiBase } = await resolveConfig(credsOverride);
  return getPaymentLinksApiBase(secretKey, apiBase);
}

async function request(path, { method = 'GET', body = null, credsOverride = null, apiBase: overrideApiBase = null } = {}) {
  const { secretKey, apiBase } = await resolveConfig(credsOverride);
  if (!secretKey) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'secret_key Pagar.me ausente');
  }
  const base = String(overrideApiBase || apiBase).replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(secretKey),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.errors?.[0]?.message ||
      (typeof data?.message === 'string' ? data.message : null) ||
      `Pagar.me HTTP ${res.status}`;
    const code =
      res.status === 401 || res.status === 403
        ? 'PAGARME_AUTH'
        : res.status === 404
          ? 'PAGARME_NOT_FOUND'
          : 'PAGARME_ERROR';
    throw new AppError(res.status >= 500 ? 502 : 400, code, msg, {
      status: res.status,
      body: data,
    });
  }
  return data;
}

async function testConnection(creds) {
  const cfg = await resolveConfig(creds);
  if (!cfg.secretKey) throw new Error('secret_key é obrigatório');
  await request('/recipients?page=1&size=1', { credsOverride: creds });
  return { ok: true, is_psp: true };
}

async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('pagarme', 'secret_key', NULL, 'PAGARME_SECRET_KEY', true, 'Chave secreta Pagar.me'),
       ('pagarme', 'public_key', NULL, 'PAGARME_PUBLIC_KEY', false, 'Chave pública Pagar.me'),
       ('pagarme', 'api_base_url', NULL, 'PAGARME_URL_API', false, 'Base URL API v5'),
       ('pagarme', 'webhook_user', NULL, 'PAGARME_WEBHOOK_USER', false, 'Usuário HTTP Basic do webhook — o mesmo que deve ser cadastrado no painel Pagar.me'),
       ('pagarme', 'webhook_pass', NULL, 'PAGARME_WEBHOOK_PASS', true, 'Senha HTTP Basic do webhook — a mesma que deve ser cadastrada no painel Pagar.me')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  DEFAULT_API_BASE,
  TEST_API_BASE,
  resolveConfig,
  getPaymentLinksApiBase,
  paymentLinksApiBase,
  request,
  testConnection,
  ensureCredentialRows,
};
