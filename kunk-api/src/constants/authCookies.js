'use strict';

/**
 * Cookies HttpOnly de sessão de operador (system_users) no Kunk OSS.
 * Um cookie por app para conviver em localhost (jar compartilhado entre portas).
 * Nome legado `kunk_oss_session` é limpo no login/logout.
 */
const LEGACY_OPERATOR_SESSION_COOKIE = 'kunk_oss_session';

/** Cookie de sessão de associado (users) — cadastramento. */
const ASSOCIATE_SESSION_COOKIE = 'associate_session';

const KUNK_APP_HEADER = 'x-kunk-app';

const KNOWN_OPERATOR_APPS = ['admin', 'kunk', 'doc-sign'];

const OPERATOR_COOKIE_BY_APP = {
  admin: 'kunk_oss_session_admin',
  kunk: 'kunk_oss_session_kunk',
  'doc-sign': 'kunk_oss_session_doc_sign',
};

/** @deprecated Use operatorCookieName(app). Kept for export compatibility. */
const OPERATOR_SESSION_COOKIE = LEGACY_OPERATOR_SESSION_COOKIE;

function normalizeOperatorApp(app) {
  const key = String(app || '').trim().toLowerCase();
  return KNOWN_OPERATOR_APPS.includes(key) ? key : null;
}

function operatorCookieName(app) {
  const key = normalizeOperatorApp(app);
  return key ? OPERATOR_COOKIE_BY_APP[key] : null;
}

/**
 * Resolve app from X-Kunk-App header or body.app.
 * @param {import('express').Request} req
 * @param {{ required?: boolean }} [opts]
 */
function resolveOperatorApp(req, opts = {}) {
  const fromHeader = req.headers?.[KUNK_APP_HEADER] || req.headers?.['X-Kunk-App'];
  const fromBody = req.body?.app;
  const app = normalizeOperatorApp(fromHeader || fromBody);
  if (!app && opts.required) {
    const { AppError } = require('../utils/response');
    throw new AppError(400, 'VALIDATION_ERROR', 'app inválido (kunk|admin|doc-sign)');
  }
  return app;
}

/**
 * Token de sessão de operador a partir dos cookies do request.
 * Com app conhecido: só o cookie daquele app.
 * Sem app: primeiro cookie de operador conhecido presente.
 */
function extractOperatorCookieToken(req, app = null) {
  const cookies = req.cookies || {};
  const normalized = normalizeOperatorApp(app);
  if (normalized) {
    const name = OPERATOR_COOKIE_BY_APP[normalized];
    return cookies[name] || null;
  }
  for (const known of KNOWN_OPERATOR_APPS) {
    const name = OPERATOR_COOKIE_BY_APP[known];
    if (cookies[name]) return cookies[name];
  }
  // Legacy fallback (migração)
  if (cookies[LEGACY_OPERATOR_SESSION_COOKIE]) {
    return cookies[LEGACY_OPERATOR_SESSION_COOKIE];
  }
  return null;
}

function hasAnyOperatorCookie(req) {
  const cookies = req.cookies || {};
  if (cookies[LEGACY_OPERATOR_SESSION_COOKIE]) return true;
  return KNOWN_OPERATOR_APPS.some((app) => Boolean(cookies[OPERATOR_COOKIE_BY_APP[app]]));
}

module.exports = {
  ASSOCIATE_SESSION_COOKIE,
  KNOWN_OPERATOR_APPS,
  KUNK_APP_HEADER,
  LEGACY_OPERATOR_SESSION_COOKIE,
  OPERATOR_COOKIE_BY_APP,
  OPERATOR_SESSION_COOKIE,
  extractOperatorCookieToken,
  hasAnyOperatorCookie,
  normalizeOperatorApp,
  operatorCookieName,
  resolveOperatorApp,
};
