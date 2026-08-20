'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const { query } = require('../../db/pool');
const { oauthRedirectUri } = require('../../utils/publicApiUrl');

const ME_ENVIRONMENTS = {
  sandbox: {
    key: 'sandbox',
    label: 'Sandbox (teste)',
    api_base_url: 'https://sandbox.melhorenvio.com.br/api/v2',
    site: 'https://sandbox.melhorenvio.com.br',
  },
  production: {
    key: 'production',
    label: 'Produção',
    api_base_url: 'https://www.melhorenvio.com.br/api/v2',
    site: 'https://www.melhorenvio.com.br',
  },
};

async function getMeCredentials(required = ['client_id', 'client_secret']) {
  return credentialsService.requireFields('melhorenvio', required);
}

function resolveEnvironmentKey(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'sandbox' || v === 'test' || v === 'homolog' || v === 'homologacao' || v === 'homologação') {
    return 'sandbox';
  }
  return 'production';
}

/**
 * Normalize Melhor Envio API base to an absolute https URL ending without trailing slash.
 * Accepts host-only values (sandbox.melhorenvio.com.br) and common typos (andbox…).
 */
function normalizeMeApiBase(raw, environment = null) {
  const envKey = resolveEnvironmentKey(environment);
  const fallback = ME_ENVIRONMENTS[envKey].api_base_url;
  let value = String(raw || '').trim();
  if (!value) return fallback;

  value = value.replace(/^andbox\./i, 'sandbox.');
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  value = value.replace(/([^:]\/)\/+/g, '$1').replace(/\/$/, '');

  try {
    const u = new URL(value);
    if (!u.pathname || u.pathname === '/') {
      value = `${u.origin}/api/v2`;
    }
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', `api_base_url inválida: ${raw}`);
  }
  return value;
}

function meSiteOrigin(apiBase) {
  const base = normalizeMeApiBase(apiBase);
  try {
    return new URL(base.replace(/\/api\/v2\/?$/, '')).origin;
  } catch {
    return ME_ENVIRONMENTS.production.site;
  }
}

function detectEnvironmentFromApiBase(apiBase) {
  const normalized = normalizeMeApiBase(apiBase || ME_ENVIRONMENTS.production.api_base_url);
  if (/sandbox\.melhorenvio\.com\.br/i.test(normalized)) return 'sandbox';
  return 'production';
}

async function getEnvironment() {
  const rows = await credentialsService.listRows('melhorenvio');
  const byKey = Object.fromEntries(rows.map((r) => [r.field_key, r]));
  const envVal = credentialsService.resolveFromRow(byKey.environment).value;
  if (envVal) return resolveEnvironmentKey(envVal);
  const apiVal = credentialsService.resolveFromRow(byKey.api_base_url).value;
  if (apiVal) return detectEnvironmentFromApiBase(apiVal);
  return 'production';
}

async function getApiBase() {
  const envKey = await getEnvironment();
  // Always pin to the official URL for the active environment
  return ME_ENVIRONMENTS[envKey].api_base_url;
}

/** Garante metadados de credenciais mesmo sem o SQL de seed aplicado. */
async function ensureCredentialRows() {
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('melhorenvio', 'client_id', NULL, 'MELHOR_ENVIO_CLIENT_ID', true, 'Melhor Envio OAuth client_id'),
       ('melhorenvio', 'client_secret', NULL, 'MELHOR_ENVIO_CLIENT_SECRET', true, 'Melhor Envio OAuth client_secret'),
       ('melhorenvio', 'redirect_uri', NULL, 'MELHOR_ENVIO_REDIRECT_URI', false, 'OAuth redirect URI (API callback)'),
       ('melhorenvio', 'api_base_url', NULL, 'MELHOR_ENVIO_API_URL', false, 'Melhor Envio API base URL'),
       ('melhorenvio', 'environment', NULL, 'MELHOR_ENVIO_ENVIRONMENT', false, 'Ambiente Melhor Envio: production (padrão) ou sandbox'),
       ('melhorenvio', 'access_token', NULL, NULL, true, 'Melhor Envio OAuth access token'),
       ('melhorenvio', 'refresh_token', NULL, NULL, true, 'Melhor Envio OAuth refresh token')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

async function ensureEnvironmentRow() {
  await ensureCredentialRows();
  // Sem valor gravado → produção (não exige sandbox antes).
  const rows = await credentialsService.listRows('melhorenvio');
  const envRow = rows.find((r) => r.field_key === 'environment');
  const hasValue = envRow && credentialsService.hasValueFromRow(envRow);
  if (!hasValue) {
    await credentialsService.putCredentials(
      'melhorenvio',
      {
        environment: 'production',
        api_base_url: ME_ENVIRONMENTS.production.api_base_url,
      },
      { runTest: false }
    );
  }
}

/**
 * Switch Melhor Envio environment. Production requires a fresh app (clears OAuth secrets).
 */
async function setEnvironment(nextEnv, { clearAppCredentials = false } = {}) {
  const envKey = resolveEnvironmentKey(nextEnv);
  await ensureEnvironmentRow();
  await credentialsService.putCredentials(
    'melhorenvio',
    {
      environment: envKey,
      api_base_url: ME_ENVIRONMENTS[envKey].api_base_url,
    },
    { runTest: false }
  );
  if (clearAppCredentials) {
    for (const field of ['client_id', 'client_secret', 'access_token', 'refresh_token']) {
      await credentialsService.deleteCredential('melhorenvio', field).catch(() => {});
    }
  }
  return {
    environment: envKey,
    api_base_url: ME_ENVIRONMENTS[envKey].api_base_url,
    urls: ME_ENVIRONMENTS,
  };
}

async function getTokens() {
  const all = await credentialsService.resolveAll('melhorenvio');
  return {
    access_token: all.access_token || null,
    refresh_token: all.refresh_token || null,
    client_id: all.client_id,
    client_secret: all.client_secret,
    redirect_uri: all.redirect_uri,
  };
}

/** OAuth presence without decrypting tokens (admin status / polling). */
async function oauthStatus() {
  const rows = await credentialsService.listRows('melhorenvio');
  const byKey = Object.fromEntries(rows.map((r) => [r.field_key, r]));
  const accessRow = byKey.access_token;
  return {
    authenticated: credentialsService.hasValueFromRow(accessRow),
    has_refresh: credentialsService.hasValueFromRow(byKey.refresh_token),
    /** Used by admin to detect re-auth completion (token replaced). */
    access_token_updated_at: accessRow?.date_updated
      ? new Date(accessRow.date_updated).toISOString()
      : null,
  };
}

async function saveTokens({ access_token, refresh_token }) {
  const now = new Date().toISOString();
  if (access_token) {
    const enc = credentialsService.encryptValue(access_token);
    await query(
      `UPDATE system_api_credentials
       SET encrypted_value = $1, date_updated = $2
       WHERE service = 'melhorenvio' AND field_key = 'access_token'`,
      [enc, now]
    );
  }
  if (refresh_token) {
    const enc = credentialsService.encryptValue(refresh_token);
    await query(
      `UPDATE system_api_credentials
       SET encrypted_value = $1, date_updated = $2
       WHERE service = 'melhorenvio' AND field_key = 'refresh_token'`,
      [enc, now]
    );
  }
}

async function buildAuthorizeUrl(state) {
  if (!state) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth ausente');
  }
  const clientId = (await credentialsService.resolveField('melhorenvio', 'client_id')).value;
  const redirect = oauthRedirectUri('melhorenvio');
  if (!clientId) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'client_id Melhor Envio ausente');
  }
  const origin = meSiteOrigin(await getApiBase());
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    state: String(state),
    scope:
      'cart-read cart-write companies-read shipping-calculate shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-tracking shipping-cancel orders-read purchases-read users-read',
  });
  return `${origin}/oauth/authorize?${params}`;
}

function meUserAgent() {
  return process.env.MELHOR_ENVIO_USER_AGENT || 'Kunk (contato@associacao)';
}

function meHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': meUserAgent(),
    ...extra,
  };
}

function coerceClientId(clientId) {
  const n = Number(clientId);
  return Number.isFinite(n) && String(n) === String(clientId).trim() ? n : clientId;
}

/** OAuth token endpoint lives on the site root, NOT under /api/v2. */
async function getOAuthTokenUrl() {
  return `${meSiteOrigin(await getApiBase())}/oauth/token`;
}

async function exchangeCode(code) {
  const clientId = (await credentialsService.resolveField('melhorenvio', 'client_id')).value;
  const clientSecret = (await credentialsService.resolveField('melhorenvio', 'client_secret')).value;
  const redirect = oauthRedirectUri('melhorenvio');
  if (!clientId || !clientSecret) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'Credenciais OAuth Melhor Envio incompletas');
  }
  if (!code) {
    throw new AppError(400, 'VALIDATION_ERROR', 'code OAuth ausente');
  }
  const tokenUrl = await getOAuthTokenUrl();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: meHeaders(),
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: coerceClientId(clientId),
      client_secret: clientSecret,
      redirect_uri: redirect,
      code,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(400, 'CREDENTIAL_INVALID', `OAuth Melhor Envio falhou (${res.status})`, {
      body: text,
      token_url: tokenUrl,
    });
  }
  const data = await res.json();
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  return { ok: true };
}

async function refreshAccessToken() {
  const tokens = await getTokens();
  if (!tokens.refresh_token || !tokens.client_id || !tokens.client_secret) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'refresh_token Melhor Envio ausente');
  }
  const tokenUrl = await getOAuthTokenUrl();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: meHeaders(),
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: coerceClientId(tokens.client_id),
      client_secret: tokens.client_secret,
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(400, 'CREDENTIAL_INVALID', `Falha ao renovar token Melhor Envio (${res.status})`, {
      body: text,
      token_url: tokenUrl,
    });
  }
  const data = await res.json();
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
  });
  return data.access_token;
}

async function getAccessToken() {
  const tokens = await getTokens();
  if (tokens.access_token) return tokens.access_token;
  throw new AppError(400, 'CREDENTIAL_MISSING', 'access_token Melhor Envio ausente — faça OAuth');
}

async function meRequest(path, body = null, method = 'GET') {
  const base = await getApiBase();
  let token = await getAccessToken();
  const doFetch = async (t) =>
    fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers: meHeaders({ Authorization: `Bearer ${t}` }),
      body: body != null ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await doFetch(token);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Melhor Envio HTTP ${res.status}`;
    let details = { body: text, status: res.status };
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = String(parsed.message);
      if (parsed?.errors) details.errors = parsed.errors;
    } catch {
      /* keep raw body */
    }
    const status = res.status >= 500 ? 502 : 400;
    throw new AppError(status, 'MELHOR_ENVIO_ERROR', message, details);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function testConnection(creds) {
  if (!creds.client_id || !creds.client_secret) {
    throw new Error('client_id e client_secret são obrigatórios');
  }
  // Soft test: credentials present; full OAuth may still be needed
  return { ok: true, note: 'client credentials presentes; OAuth pode ser necessário para quote' };
}

module.exports = {
  ME_ENVIRONMENTS,
  getMeCredentials,
  getApiBase,
  getEnvironment,
  setEnvironment,
  ensureEnvironmentRow,
  ensureCredentialRows,
  getTokens,
  saveTokens,
  buildAuthorizeUrl,
  exchangeCode,
  meRequest,
  oauthStatus,
  testConnection,
  getAccessToken,
  normalizeMeApiBase,
  resolveEnvironmentKey,
  detectEnvironmentFromApiBase,
};
