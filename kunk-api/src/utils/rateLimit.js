'use strict';

/**
 * Simple in-memory rate limiter (per process).
 * Suitable for single-instance installs; returns true when under limit.
 */
const buckets = new Map();

function prune(key, windowMs) {
  const entry = buckets.get(key);
  if (!entry) return;
  const cutoff = Date.now() - windowMs;
  entry.times = entry.times.filter((t) => t > cutoff);
  if (!entry.times.length) buckets.delete(key);
}

function peekRateLimit(key, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  prune(key, windowMs);
  const entry = buckets.get(key);
  if (entry && entry.times.length >= limit) {
    return { ok: false, retryAfterMs: entry.times[0] + windowMs - now };
  }
  return { ok: true };
}

function checkRateLimit(key, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const peeked = peekRateLimit(key, { limit, windowMs });
  if (!peeked.ok) return peeked;
  let entry = buckets.get(key);
  if (!entry) {
    entry = { times: [] };
    buckets.set(key, entry);
  }
  entry.times.push(Date.now());
  return { ok: true };
}

function resetRateLimits() {
  buckets.clear();
}

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const AUTH_ENUM_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PER_EMAIL = 5;
const LOGIN_PER_IP = 30;

function rateLimitedError() {
  const { AppError } = require('./response');
  throw new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.');
}

/** 5 / 15 min per IP on public routes (exists, register-email, triage form). No-op when AUTH_ENUM_RATE_LIMIT=0. */
function assertAuthEnumRateLimit(req, prefix) {
  const { env } = require('../config/env');
  if (!env.authEnumRateLimit) return;
  const ip = requestIp(req);
  const limited = checkRateLimit(`${prefix}:${ip}`, { limit: 5, windowMs: AUTH_ENUM_WINDOW_MS });
  if (!limited.ok) rateLimitedError();
}

function loginRateLimitKeys(req, prefix, email) {
  const ip = requestIp(req);
  const normalized = String(email || '').trim().toLowerCase();
  return {
    perEmail: { key: `${prefix}:${ip}:${normalized}`, limit: LOGIN_PER_EMAIL, windowMs: LOGIN_WINDOW_MS },
    perIp: { key: `${prefix}:${ip}`, limit: LOGIN_PER_IP, windowMs: LOGIN_WINDOW_MS },
  };
}

/** Peek only — successful logins must not consume quota. No-op when AUTH_ENUM_RATE_LIMIT=0. */
function assertLoginRateLimit(req, prefix, email) {
  const { env } = require('../config/env');
  if (!env.authEnumRateLimit) return;
  const { perEmail, perIp } = loginRateLimitKeys(req, prefix, email);
  if (!peekRateLimit(perEmail.key, perEmail).ok || !peekRateLimit(perIp.key, perIp).ok) {
    rateLimitedError();
  }
}

function recordLoginFailure(req, prefix, email) {
  const { env } = require('../config/env');
  if (!env.authEnumRateLimit) return;
  const { perEmail, perIp } = loginRateLimitKeys(req, prefix, email);
  checkRateLimit(perEmail.key, perEmail);
  checkRateLimit(perIp.key, perIp);
}

module.exports = {
  checkRateLimit,
  peekRateLimit,
  resetRateLimits,
  requestIp,
  assertAuthEnumRateLimit,
  assertLoginRateLimit,
  recordLoginFailure,
};
