'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const { assertIntegerPercentage } = require('../pagarme/split');

let tokenCache = { accessToken: null, expiresAt: 0 };

function remoteMessage(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    data.message ||
    data.mensagem ||
    data.error ||
    data.errors?.[0]?.message ||
    (typeof data.errors?.[0] === 'string' ? data.errors[0] : null) ||
    null
  );
}

function truncateBody(data, max = 800) {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    if (!s) return null;
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return null;
  }
}

async function resolveCreds(override = null) {
  const resolved = override || (await credentialsService.resolveAll('soucannabis_orders'));
  const baseUrl = String(resolved.base_url || '').trim().replace(/\/$/, '');
  const clientId = String(resolved.client_id || '').trim();
  const clientSecret = String(resolved.client_secret || '').trim();
  let tokenUrl = String(resolved.token_url || '').trim();
  if (!tokenUrl && baseUrl) tokenUrl = `${baseUrl}/api/external/auth/token`;
  return { baseUrl, clientId, clientSecret, tokenUrl };
}

async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('soucannabis_orders', 'base_url', NULL, 'SOUCANNABIS_ORDERS_BASE_URL', false, 'Base URL Kunk SouCannabis'),
       ('soucannabis_orders', 'client_id', NULL, 'SOUCANNABIS_ORDERS_CLIENT_ID', true, 'OAuth client_id'),
       ('soucannabis_orders', 'client_secret', NULL, 'SOUCANNABIS_ORDERS_CLIENT_SECRET', true, 'OAuth client_secret'),
       ('soucannabis_orders', 'token_url', NULL, 'SOUCANNABIS_ORDERS_TOKEN_URL', false, 'Token URL'),
       ('soucannabis_orders_outbound', 'client_id', NULL, NULL, false, 'Outbound client_id'),
       ('soucannabis_orders_outbound', 'client_secret', NULL, NULL, true, 'Outbound client_secret'),
       ('soucannabis_orders_outbound', 'orders_path', NULL, NULL, false, 'Outbound orders path')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

async function fetchToken(credsOverride = null) {
  const { clientId, clientSecret, tokenUrl, baseUrl } = await resolveCreds(credsOverride);
  const missing = [];
  if (!baseUrl && !tokenUrl) missing.push('base_url (ou token_url)');
  if (!clientId) missing.push('client_id');
  if (!clientSecret) missing.push('client_secret');
  if (!tokenUrl) missing.push('token_url');
  if (missing.length) {
    throw new AppError(
      400,
      'CREDENTIAL_MISSING',
      `Credenciais soucannabis_orders incompletas: falta ${missing.join(', ')}`,
      { step: 'token', missing, base_url: baseUrl || null, token_url: tokenUrl || null }
    );
  }

  let res;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  } catch (err) {
    throw new AppError(
      502,
      'SC_TOKEN_NETWORK',
      `Não foi possível alcançar a Token URL (${tokenUrl}): ${err.message || err}`,
      {
        step: 'token',
        token_url: tokenUrl,
        base_url: baseUrl || null,
        cause: String(err.message || err),
      }
    );
  }

  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text?.slice?.(0, 500) || text };
  }

  if (!res.ok || !data.access_token) {
    const remote = remoteMessage(data) || (res.ok ? 'resposta sem access_token' : null);
    const status = res.status || 502;
    const code = status === 400 ? 'SC_TOKEN_BAD_REQUEST' : status === 401 ? 'SC_AUTH_FAILED' : 'SC_TOKEN_FAILED';
    throw new AppError(
      status >= 500 ? 502 : status === 401 ? 401 : 400,
      code,
      remote
        ? `Falha no token SouCannabis (HTTP ${status}): ${remote}`
        : `Falha no token SouCannabis (HTTP ${status}) em ${tokenUrl}`,
      {
        step: 'token',
        token_url: tokenUrl,
        base_url: baseUrl || null,
        remote_status: status,
        remote_message: remote,
        body_preview: truncateBody(data),
      }
    );
  }

  const expiresIn = Number(data.expires_in || 3600);
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000,
  };
  return data.access_token;
}

async function getAccessToken(credsOverride = null) {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt && !credsOverride) {
    return tokenCache.accessToken;
  }
  return fetchToken(credsOverride);
}

async function apiRequest(path, { method = 'GET', body = null, credsOverride = null } = {}) {
  const { baseUrl } = await resolveCreds(credsOverride);
  if (!baseUrl) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'base_url SouCannabis ausente', {
      step: 'api',
      path,
      missing: ['base_url'],
    });
  }
  const token = await getAccessToken(credsOverride);
  const url = `${baseUrl}/api/external${path.startsWith('/') ? path : `/${path}`}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AppError(
      502,
      'SC_API_NETWORK',
      `Não foi possível alcançar a API SouCannabis (${url}): ${err.message || err}`,
      {
        step: 'api',
        method,
        path,
        url,
        cause: String(err.message || err),
      }
    );
  }

  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice?.(0, 500) || text };
  }
  if (!res.ok) {
    const remote = remoteMessage(data);
    throw new AppError(
      res.status === 409 ? 409 : res.status >= 500 ? 502 : 400,
      res.status === 409 ? 'SC_CONFLICT' : 'SC_API_ERROR',
      remote
        ? `SouCannabis ${method} ${path} (HTTP ${res.status}): ${remote}`
        : `SouCannabis ${method} ${path} HTTP ${res.status}`,
      {
        step: 'api',
        method,
        path,
        url,
        remote_status: res.status,
        remote_message: remote,
        body_preview: truncateBody(data),
        status: res.status,
        body: data,
      }
    );
  }
  return data;
}

async function getMe(credsOverride = null) {
  return apiRequest('/me', { credsOverride });
}

async function getProducts(credsOverride = null) {
  return apiRequest('/products', { credsOverride });
}

async function getTags(credsOverride = null) {
  return apiRequest('/tags', { credsOverride });
}

async function createRemoteOrder(payload, credsOverride = null) {
  return apiRequest('/orders', { method: 'POST', body: payload, credsOverride });
}

async function patchRemoteOrder(remoteId, payload, credsOverride = null) {
  return apiRequest(`/orders/${remoteId}`, { method: 'PATCH', body: payload, credsOverride });
}

async function deleteRemoteOrder(remoteId, credsOverride = null) {
  return apiRequest(`/orders/${remoteId}`, { method: 'DELETE', credsOverride });
}

async function testConnection(creds) {
  await fetchToken(creds);
  const me = await getMe(creds);
  try {
    assertIntegerPercentage(me.payment_percentage);
  } catch (err) {
    if (err instanceof AppError) {
      throw new AppError(err.status, err.code, `[me] ${err.message}`, {
        ...(err.details || {}),
        step: 'payment_percentage',
        payment_percentage: me?.payment_percentage ?? null,
        remote_app_id: me?.id || null,
      });
    }
    throw err;
  }
  await getProducts(creds).catch((err) => {
    if (err.details?.remote_status === 404 || err.details?.status === 404) return [];
    throw err;
  });
  await getTags(creds).catch((err) => {
    if (err.details?.remote_status === 404 || err.details?.status === 404) return [];
    throw err;
  });
  return { ok: true, me };
}

function clearTokenCache() {
  tokenCache = { accessToken: null, expiresAt: 0 };
}

module.exports = {
  ensureCredentialRows,
  resolveCreds,
  getAccessToken,
  apiRequest,
  getMe,
  getProducts,
  getTags,
  createRemoteOrder,
  patchRemoteOrder,
  deleteRemoteOrder,
  testConnection,
  clearTokenCache,
};
