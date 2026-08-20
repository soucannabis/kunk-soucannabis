'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');

let cachedToken = null;
let cachedTokenExp = 0;

async function getLoggiCredentials() {
  return credentialsService.requireFields('loggi', ['client_id', 'client_secret', 'company_id']);
}

async function getApiBase() {
  const all = await credentialsService.resolveAll('loggi');
  return (all.api_base_url || process.env.LOGGI_URL_API || 'https://api.loggi.com/v1').replace(/\/$/, '');
}

async function getTokenUrl() {
  const all = await credentialsService.resolveAll('loggi');
  return all.token_url || process.env.LOGGI_TOKEN_URL || 'https://api.loggi.com/v2/oauth2/token';
}

/**
 * Extrai mensagem legível do body de erro da API Loggi (JSON / texto).
 */
function parseLoggiErrorBody(text, httpStatus) {
  const fallback = `Loggi HTTP ${httpStatus}`;
  const raw = String(text || '').trim();
  if (!raw) return { message: fallback, details: { status: httpStatus } };

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      message: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
      details: { status: httpStatus, body: raw },
    };
  }

  const parts = [];
  const fieldNotes = [];

  const pushMsg = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    if (/^request failed with status code/i.test(s)) return;
    if (!parts.includes(s)) parts.push(s);
  };

  const walkDetail = (d) => {
    if (d == null) return;
    if (typeof d === 'string') {
      pushMsg(d);
      return;
    }
    if (Array.isArray(d)) {
      d.forEach(walkDetail);
      return;
    }
    if (typeof d !== 'object') return;

    pushMsg(d.description || d.message || d.reason || d.error);

    const violations = d.fieldViolations || d.field_violations || d.violations;
    if (Array.isArray(violations)) {
      for (const v of violations) {
        const field = v.field || v.path || v.name || '';
        const desc = v.description || v.message || v.reason || '';
        const line = [field, desc].filter(Boolean).join(': ');
        if (line) fieldNotes.push(line);
      }
    }

    if (Array.isArray(d.details)) d.details.forEach(walkDetail);
  };

  if (typeof parsed.error === 'string') pushMsg(parsed.error);
  if (typeof parsed.message === 'string') pushMsg(parsed.message);
  if (parsed.error && typeof parsed.error === 'object') {
    pushMsg(parsed.error.message || parsed.error.status);
    walkDetail(parsed.error.details);
  }
  walkDetail(parsed.details);

  if (Array.isArray(parsed.errors)) {
    for (const e of parsed.errors) {
      if (typeof e === 'string') pushMsg(e);
      else pushMsg(e?.message || e?.description);
    }
  }

  let message = parts[0] || fallback;
  if (fieldNotes.length) {
    message = `${message}\n${fieldNotes.map((n) => `• ${n}`).join('\n')}`;
  } else if (parts.length > 1) {
    message = parts.join('\n');
  }

  return {
    message,
    details: {
      status: httpStatus,
      body: parsed,
      messages: parts,
      field_violations: fieldNotes,
    },
  };
}

async function obtainToken(creds) {
  const now = Date.now();
  if (cachedToken && cachedTokenExp > now + 30_000) return cachedToken;

  const tokenUrl = await getTokenUrl();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { message, details } = parseLoggiErrorBody(text, res.status);
    throw new AppError(400, 'CREDENTIAL_INVALID', `Falha OAuth Loggi: ${message}`, details);
  }
  const data = await res.json();
  const token = data.idToken || data.access_token || data.token;
  if (!token) {
    throw new AppError(400, 'CREDENTIAL_INVALID', 'Token Loggi ausente na resposta');
  }
  cachedToken = token;
  cachedTokenExp = now + (Number(data.expires_in) || 3500) * 1000;
  return token;
}

async function loggiRequest(path, body = null, method = 'GET', credsOverride = null) {
  const creds = credsOverride || (await getLoggiCredentials());
  const token = String(await obtainToken(creds) || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) {
    throw new AppError(400, 'CREDENTIAL_INVALID', 'Token Loggi ausente');
  }
  const base = await getApiBase();
  const url = `${base}/companies/${creds.company_id}${path}`;
  // Legado: objeto vazio não envia body (axios data: undefined)
  const hasBody =
    body != null &&
    !(typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { message, details } = parseLoggiErrorBody(text, res.status);
    const status = res.status >= 500 ? 502 : res.status === 401 || res.status === 403 ? res.status : 400;
    throw new AppError(status, 'LOGGI_ERROR', message, {
      ...details,
      path,
      method,
      url,
    });
  }
  if (res.status === 204) return null;
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function testConnection(creds) {
  await obtainToken(creds);
  cachedToken = null;
  return { ok: true };
}

function clearTokenCache() {
  cachedToken = null;
  cachedTokenExp = 0;
}

/** Garante metadados de credenciais mesmo sem o SQL de seed aplicado. */
async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('loggi', 'client_id', NULL, 'LOGGI_CLIENT_ID', true, 'Loggi OAuth client_id'),
       ('loggi', 'client_secret', NULL, 'LOGGI_CLIENT_SECRET', true, 'Loggi OAuth client_secret'),
       ('loggi', 'company_id', NULL, 'LOGGI_COMPANY_ID', false, 'Loggi company id'),
       ('loggi', 'api_base_url', NULL, 'LOGGI_URL_API', false, 'Loggi API base URL'),
       ('loggi', 'token_url', NULL, 'LOGGI_TOKEN_URL', false, 'Loggi OAuth token URL')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  getLoggiCredentials,
  loggiRequest,
  obtainToken,
  testConnection,
  clearTokenCache,
  getApiBase,
  parseLoggiErrorBody,
  ensureCredentialRows,
};
