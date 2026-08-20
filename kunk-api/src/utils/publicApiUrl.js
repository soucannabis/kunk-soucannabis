'use strict';

const { env } = require('../config/env');
const { AppError } = require('./response');

/** Hosts Docker / rede interna — nunca usar em redirect OAuth público. */
function isInternalHostname(host) {
  const hostname = String(host || '')
    .split(':')[0]
    .trim()
    .toLowerCase();
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  if (hostname.includes('.')) return false;
  return true;
}

function publicApiUrlFromEnv() {
  return String(process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function isProduction() {
  return String(process.env.NODE_ENV || env.nodeEnv || '') === 'production';
}

function localhostDefault() {
  const port = env.port || Number(process.env.PORT) || 8056;
  return `http://localhost:${port}`;
}

/**
 * Public base URL of the API (no trailing slash).
 * Prefer PUBLIC_API_URL. Never derived from Host / X-Forwarded-* (OAuth redirect poisoning).
 * Production requires the env; other environments fall back to localhost.
 */
function publicApiBase(_req) {
  const fromEnv = publicApiUrlFromEnv();
  if (fromEnv) return fromEnv;
  if (isProduction()) {
    throw new AppError(
      400,
      'PUBLIC_API_URL_MISSING',
      'Defina PUBLIC_API_URL (URL pública da API, sem barra final)'
    );
  }
  return localhostDefault();
}

/** OAuth callback: /api/v1/modules/:service/oauth/callback — never from the request. */
function oauthRedirectUri(service, _req) {
  const name = String(service || '').trim();
  if (!name) {
    throw new AppError(500, 'CONFIG_ERROR', 'serviço OAuth ausente');
  }
  return `${publicApiBase()}/api/v1/modules/${name}/oauth/callback`;
}

module.exports = {
  publicApiBase,
  oauthRedirectUri,
  isInternalHostname,
  publicApiUrlFromEnv,
};
