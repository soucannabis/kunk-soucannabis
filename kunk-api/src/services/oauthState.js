'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/response');

const TTL_MS = 10 * 60 * 1000;
/** nonce → expiresAt — one-time use, in-process. */
const pending = new Map();

function hmacSecret() {
  const key = env.configEncryptKey || process.env.CONFIG_ENCRYPT_KEY || '';
  if (!key) {
    throw new AppError(500, 'CONFIG_ERROR', 'CONFIG_ENCRYPT_KEY é obrigatória para OAuth state');
  }
  return key;
}

function sign(payload) {
  return crypto.createHmac('sha256', hmacSecret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function pruneExpired(now = Date.now()) {
  for (const [nonce, exp] of pending) {
    if (exp <= now) pending.delete(nonce);
  }
}

function createOAuthState(service) {
  const name = String(service || '').trim();
  if (!name) {
    throw new AppError(500, 'CONFIG_ERROR', 'serviço OAuth ausente');
  }
  pruneExpired();
  const nonce = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + TTL_MS;
  pending.set(nonce, exp);
  const payload = Buffer.from(JSON.stringify({ s: name, n: nonce, e: exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function assertOAuthState(service, state) {
  const name = String(service || '').trim();
  const raw = String(state || '').trim();
  if (!raw) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth ausente');
  }
  const dot = raw.lastIndexOf('.');
  if (dot < 1) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth inválido');
  }
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth inválido');
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth inválido');
  }
  if (!data || data.s !== name || !data.n || !data.e) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth inválido');
  }
  if (Date.now() > Number(data.e)) {
    pending.delete(data.n);
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth expirado');
  }
  if (!pending.has(data.n)) {
    throw new AppError(400, 'OAUTH_STATE_INVALID', 'state OAuth já usado ou desconhecido');
  }
  pending.delete(data.n);
}

function _resetOAuthStateForTests() {
  pending.clear();
}

module.exports = {
  createOAuthState,
  assertOAuthState,
  _resetOAuthStateForTests,
  TTL_MS,
};
