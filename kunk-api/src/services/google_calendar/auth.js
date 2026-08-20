'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const { query } = require('../../db/pool');
const { oauthRedirectUri } = require('../../utils/publicApiUrl');

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/calendar'].join(' ');

async function resolveCreds() {
  const rows = await credentialsService.listRows('google_calendar');
  const byKey = Object.fromEntries(rows.map((r) => [r.field_key, r]));
  const get = (k) => credentialsService.resolveFromRow(byKey[k]).value;
  return {
    client_id: get('client_id'),
    client_secret: get('client_secret'),
    redirect_uri: get('redirect_uri'),
    access_token: get('access_token'),
    refresh_token: get('refresh_token'),
  };
}

async function saveTokens({ access_token, refresh_token }) {
  const fields = {};
  if (access_token) fields.access_token = access_token;
  if (refresh_token) fields.refresh_token = refresh_token;
  if (Object.keys(fields).length) {
    await credentialsService.putCredentials('google_calendar', fields, { runTest: false });
  }
}

async function getAuthorizeUrl(state) {
  if (!state) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth ausente');
  }
  const creds = await resolveCreds();
  const redirectUri = oauthRedirectUri('google_calendar');
  if (!creds.client_id) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'client_id do Google Calendar é obrigatório');
  }
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: String(state),
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

async function exchangeCode(code) {
  const creds = await resolveCreds();
  const redirectUri = oauthRedirectUri('google_calendar');
  if (!creds.client_id || !creds.client_secret) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'Credenciais OAuth Google incompletas');
  }
  if (!code) {
    throw new AppError(400, 'VALIDATION_ERROR', 'code OAuth ausente');
  }
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(400, 'CREDENTIAL_INVALID', `OAuth Google falhou (${res.status})`, { body: text });
  }
  const data = await res.json();
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  return { ok: true };
}

async function refreshAccessToken() {
  const creds = await resolveCreds();
  if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
    throw new AppError(401, 'OAUTH_REQUIRED', 'refresh_token Google ausente — autorize no admin');
  }
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(400, 'CREDENTIAL_INVALID', `Falha ao renovar token Google (${res.status})`, {
      body: text,
    });
  }
  const data = await res.json();
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || creds.refresh_token,
  });
  return data.access_token;
}

async function getAccessToken() {
  const creds = await resolveCreds();
  if (creds.access_token) return creds.access_token;
  return refreshAccessToken();
}

async function oauthStatus() {
  const creds = await resolveCreds();
  return {
    connected: Boolean(creds.refresh_token || creds.access_token),
    has_refresh_token: Boolean(creds.refresh_token),
    credentials_complete: Boolean(creds.client_id && creds.client_secret && creds.redirect_uri),
  };
}

async function testConnection(merged) {
  const stored = await resolveCreds();
  const clientId = merged?.client_id || stored.client_id;
  const clientSecret = merged?.client_secret || stored.client_secret;
  const redirectUri = merged?.redirect_uri || stored.redirect_uri;
  const refresh = merged?.refresh_token || stored.refresh_token;
  const access = merged?.access_token || stored.access_token;

  if (!clientId) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'client_id Google ausente');
  }
  if (!clientSecret) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'client_secret Google ausente');
  }
  if (!redirectUri) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'redirect_uri Google ausente');
  }

  // Soft test before first OAuth (same idea as Melhor Envio).
  if (!refresh && !access) {
    return { ok: true, note: 'client credentials presentes; OAuth necessário' };
  }

  const token = access || (await getAccessToken());
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    const retry = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: { Authorization: `Bearer ${fresh}` },
    });
    if (!retry.ok) {
      throw new AppError(
        502,
        'GOOGLE_API_ERROR',
        'Não foi possível validar a conexão com o Google Calendar após renovar o token.'
      );
    }
    return { ok: true };
  }
  if (!res.ok) {
    throw new AppError(
      502,
      'GOOGLE_API_ERROR',
      'Não foi possível validar a conexão com o Google Calendar. Confira OAuth e permissões.'
    );
  }
  return { ok: true };
}

async function getPrimaryCalendarId() {
  const result = await query(
    `SELECT value FROM system_configs
     WHERE system = 'modules' AND key = 'modules.google_calendar.primary_calendar_id'
     LIMIT 1`
  );
  return result.rows[0]?.value || null;
}

async function getSchedulingEnabled() {
  const result = await query(
    `SELECT value FROM system_configs
     WHERE system = 'modules' AND key = 'modules.google_calendar.use_for_scheduling'
     LIMIT 1`
  );
  const v = result.rows[0]?.value;
  if (v == null || v === '') return false;
  return String(v).toLowerCase() === 'true' || v === '1';
}

/** Garante metadados de credenciais mesmo sem o SQL de seed aplicado. */
async function ensureCredentialRows() {
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       (
         'google_calendar', 'client_id', NULL, 'GOOGLE_CLIENT_ID', true,
         'Google OAuth Client ID'
       ),
       (
         'google_calendar', 'client_secret', NULL, 'GOOGLE_CLIENT_SECRET', true,
         'Google OAuth Client Secret'
       ),
       (
         'google_calendar', 'redirect_uri', NULL, 'GOOGLE_REDIRECT_URI', false,
         'OAuth redirect URI (API callback)'
       ),
       (
         'google_calendar', 'access_token', NULL, NULL, true,
         'Google OAuth access token (preenchido pelo callback)'
       ),
       (
         'google_calendar', 'refresh_token', NULL, 'GOOGLE_REFRESH_TOKEN', true,
         'Google OAuth refresh token'
       )
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  getAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  getAccessToken,
  oauthStatus,
  testConnection,
  resolveCreds,
  getPrimaryCalendarId,
  getSchedulingEnabled,
  ensureCredentialRows,
};
