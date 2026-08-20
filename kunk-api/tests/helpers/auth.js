'use strict';

const request = require('supertest');
const { getApp } = require('./app');
const { ensureAdminUser, query } = require('./db');
const { OPERATOR_COOKIE_BY_APP } = require('../../src/constants/authCookies');

function extractCookie(setCookie, name = OPERATOR_COOKIE_BY_APP.admin) {
  if (!setCookie) return null;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const raw = list.find((c) => String(c).startsWith(`${name}=`)) || list[0];
  return String(raw).split(';')[0];
}

function extractAssociateCookie(setCookie) {
  return extractCookie(setCookie, 'associate_session');
}

async function setApiAccessEnabled(enabled) {
  const value = enabled ? 'true' : 'false';
  await query(
    `INSERT INTO system_configs (
       system, key, value, value_type, is_sensitive, is_required, allow_hardcoded, hardcoded_default, description, date_created
     ) VALUES (
       'api', 'api.enabled', $1, 'boolean', false, false, true, 'false',
       'Habilita autenticação Bearer e gestão de tokens de API no Admin', NOW()
     )
     ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value, date_updated = NOW()`,
    [value]
  );
}

async function loginAsAdmin(appName = 'admin') {
  const app = getApp();
  const creds = await ensureAdminUser();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Kunk-App', appName)
    .send(creds);
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookieName = OPERATOR_COOKIE_BY_APP[appName] || OPERATOR_COOKIE_BY_APP.admin;
  const cookie = extractCookie(res.headers['set-cookie'], cookieName);
  return { app, cookie, user: res.body.data.user, creds, appName };
}

async function loginAsOperator(overrides = {}) {
  const { ensureOperatorUser } = require('./db');
  const app = getApp();
  const appName = overrides.app || 'kunk';
  const creds = await ensureOperatorUser(overrides);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Kunk-App', appName)
    .send({ email: creds.email, password: creds.password });
  if (res.status !== 200) {
    throw new Error(`operator login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookieName = OPERATOR_COOKIE_BY_APP[appName] || OPERATOR_COOKIE_BY_APP.kunk;
  const cookie = extractCookie(res.headers['set-cookie'], cookieName);
  return { app, cookie, user: res.body.data.user, creds, appName };
}

async function createBearerToken(cookie, scopes = ['*']) {
  await setApiAccessEnabled(true);
  const app = getApp();
  const res = await request(app)
    .post('/api/v1/auth/tokens')
    .set('Cookie', cookie)
    .set('X-Kunk-App', 'admin')
    .send({ email: 'integration-token', scopes });
  if (res.status !== 201) {
    throw new Error(`token create failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
}

module.exports = {
  loginAsAdmin,
  loginAsOperator,
  createBearerToken,
  setApiAccessEnabled,
  extractCookie,
  extractAssociateCookie,
};
