'use strict';

const crypto = require('crypto');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_URL = 2000;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const TOKEN_RE = /\b(Bearer\s+)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gi;
const ALLOWED_SOURCES = new Set(['backend', 'frontend']);
const ALLOWED_RESOLVE = new Set(['fixed', 'ignored', 'open']);

function truncate(value, max) {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function sanitizeText(value, max) {
  if (value == null || value === '') return null;
  let s = String(value);
  s = s.replace(EMAIL_RE, '[email]');
  s = s.replace(CPF_RE, '[cpf]');
  s = s.replace(TOKEN_RE, '[token]');
  return truncate(s, max);
}

function sanitizeMetadata(meta) {
  if (meta == null) return null;
  let raw;
  try {
    raw = typeof meta === 'string' ? JSON.parse(meta) : meta;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    if (typeof v === 'string') out[k] = sanitizeText(v, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = truncate(JSON.stringify(v), 500);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Parse first app frame from a V8/Node stack (skip node_modules).
 */
function parseStackFrame(stack) {
  if (!stack) return { file_name: null, lineno: null, colno: null };
  const lines = String(stack).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    if (trimmed.includes('node_modules')) continue;
    const m =
      trimmed.match(/\((.+):(\d+):(\d+)\)$/) ||
      trimmed.match(/at (.+):(\d+):(\d+)$/);
    if (!m) continue;
    const file = m[1];
    if (file.startsWith('node:') || file.includes('node:internal')) continue;
    return {
      file_name: truncate(file, 500),
      lineno: Number(m[2]) || null,
      colno: Number(m[3]) || null,
    };
  }
  return { file_name: null, lineno: null, colno: null };
}

function computeHash({ message, file_name, lineno, code, source }) {
  const raw = [
    String(message || '').trim(),
    String(file_name || ''),
    lineno == null ? '' : String(lineno),
    String(code || ''),
    String(source || ''),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function normalizePayload(payload = {}) {
  const source = String(payload.source || '').trim().toLowerCase();
  if (!ALLOWED_SOURCES.has(source)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'source deve ser backend ou frontend');
  }
  const message = sanitizeText(payload.message, MAX_MESSAGE);
  if (!message) {
    throw new AppError(400, 'VALIDATION_ERROR', 'message é obrigatório');
  }

  let file_name = sanitizeText(payload.file_name, 500);
  let lineno = payload.lineno != null ? Number(payload.lineno) : null;
  let colno = payload.colno != null ? Number(payload.colno) : null;
  if (Number.isNaN(lineno)) lineno = null;
  if (Number.isNaN(colno)) colno = null;

  const stack_trace = sanitizeText(payload.stack_trace || payload.stack, MAX_STACK);
  if ((!file_name || lineno == null) && stack_trace) {
    const parsed = parseStackFrame(stack_trace);
    file_name = file_name || parsed.file_name;
    if (lineno == null) lineno = parsed.lineno;
    if (colno == null) colno = parsed.colno;
  }

  const code = sanitizeText(payload.code, 120);
  const error_hash =
    payload.error_hash && /^[a-f0-9]{64}$/i.test(payload.error_hash)
      ? String(payload.error_hash).toLowerCase()
      : computeHash({ message, file_name, lineno, code, source });

  let status_code = payload.status_code != null ? Number(payload.status_code) : null;
  if (Number.isNaN(status_code)) status_code = null;

  return {
    error_hash,
    source,
    app: sanitizeText(payload.app, 64),
    severity: sanitizeText(payload.severity, 32) || 'error',
    message,
    code,
    file_name,
    lineno,
    colno,
    stack_trace,
    url: sanitizeText(payload.url, MAX_URL),
    method: sanitizeText(payload.method, 16),
    status_code,
    user_code: sanitizeText(payload.user_code, 120),
    user_agent: sanitizeText(payload.user_agent, 500),
    request_id: sanitizeText(payload.request_id, 120),
    environment: sanitizeText(payload.environment, 64) || process.env.NODE_ENV || null,
    metadata: sanitizeMetadata(payload.metadata),
  };
}

async function record(payload) {
  const row = normalizePayload(payload);
  const result = await query(
    `INSERT INTO system_errors (
       error_hash, source, app, severity, message, code,
       file_name, lineno, colno, stack_trace,
       url, method, status_code, user_code, user_agent, request_id,
       environment, metadata, date_created
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, NOW()
     ) RETURNING *`,
    [
      row.error_hash,
      row.source,
      row.app,
      row.severity,
      row.message,
      row.code,
      row.file_name,
      row.lineno,
      row.colno,
      row.stack_trace,
      row.url,
      row.method,
      row.status_code,
      row.user_code,
      row.user_agent,
      row.request_id,
      row.environment,
      row.metadata == null ? null : JSON.stringify(row.metadata),
    ],
  );
  return result.rows[0];
}

async function recordSafe(payload) {
  try {
    return await record(payload);
  } catch (err) {
    console.error('[systemErrorsService.recordSafe]', err.message || err);
    return null;
  }
}

function parsePeriodMs(period) {
  const raw = String(period || '30d').trim().toLowerCase();
  const m = raw.match(/^(\d+)(h|d|w)$/);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'w') return n * 7 * 24 * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

async function summary() {
  const openResult = await query(
    `SELECT COUNT(DISTINCT e.error_hash)::int AS c
     FROM system_errors e
     LEFT JOIN system_error_resolutions r ON r.error_hash = e.error_hash
     WHERE COALESCE(r.status, 'open') = 'open'`,
  );
  const last24h = await query(
    `SELECT COUNT(*)::int AS c FROM system_errors
     WHERE date_created >= NOW() - INTERVAL '24 hours'`,
  );
  const last7d = await query(
    `SELECT COUNT(*)::int AS c FROM system_errors
     WHERE date_created >= NOW() - INTERVAL '7 days'`,
  );
  return {
    open_groups: openResult.rows[0]?.c || 0,
    events_24h: last24h.rows[0]?.c || 0,
    events_7d: last7d.rows[0]?.c || 0,
  };
}

async function top({ period = '30d', limit = 50, openOnly = true } = {}) {
  const ms = parsePeriodMs(period);
  const since = new Date(Date.now() - ms);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const openClause = openOnly ? `AND COALESCE(r.status, 'open') = 'open'` : '';
  const result = await query(
    `SELECT
       e.error_hash,
       MAX(e.message) AS message,
       MAX(e.source) AS source,
       MAX(e.app) AS app,
       MAX(e.code) AS code,
       MAX(e.file_name) AS file_name,
       MAX(e.lineno) AS lineno,
       COUNT(*)::int AS count,
       MAX(e.date_created) AS last_seen,
       MIN(e.date_created) AS first_seen,
       COALESCE(MAX(r.status), 'open') AS resolution_status
     FROM system_errors e
     LEFT JOIN system_error_resolutions r ON r.error_hash = e.error_hash
     WHERE e.date_created >= $1
     ${openClause}
     GROUP BY e.error_hash
     ORDER BY count DESC, last_seen DESC
     LIMIT $2`,
    [since.toISOString(), lim],
  );
  return result.rows;
}

async function list({
  limit = 50,
  offset = 0,
  error_hash = null,
  source = null,
  period = null,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const clauses = [];
  const params = [];
  if (error_hash) {
    params.push(String(error_hash));
    clauses.push(`error_hash = $${params.length}`);
  }
  if (source) {
    params.push(String(source));
    clauses.push(`source = $${params.length}`);
  }
  if (period) {
    const since = new Date(Date.now() - parsePeriodMs(period));
    params.push(since.toISOString());
    clauses.push(`date_created >= $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(lim);
  params.push(off);
  const result = await query(
    `SELECT * FROM system_errors
     ${where}
     ORDER BY date_created DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return result.rows;
}

async function samplesForHash(error_hash, { limit = 5 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const result = await query(
    `SELECT id, date_created, message, stack_trace, url, method, status_code,
            user_code, user_agent, app, source, code, file_name, lineno, metadata
     FROM system_errors
     WHERE error_hash = $1
     ORDER BY date_created DESC
     LIMIT $2`,
    [String(error_hash), lim],
  );
  return result.rows;
}

async function resolve({ error_hash, status, note, resolved_by }) {
  const hash = String(error_hash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'error_hash inválido');
  }
  const st = String(status || '').trim().toLowerCase();
  if (!ALLOWED_RESOLVE.has(st)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status deve ser open, fixed ou ignored');
  }
  const resolvedAt = st === 'open' ? null : new Date().toISOString();
  const result = await query(
    `INSERT INTO system_error_resolutions (error_hash, status, resolved_at, resolved_by, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (error_hash) DO UPDATE SET
       status = EXCLUDED.status,
       resolved_at = EXCLUDED.resolved_at,
       resolved_by = EXCLUDED.resolved_by,
       note = EXCLUDED.note
     RETURNING *`,
    [hash, st, resolvedAt, sanitizeText(resolved_by, 120), sanitizeText(note, 2000)],
  );
  return result.rows[0];
}

/**
 * Build a backend record payload from an Error + Express req.
 */
function payloadFromBackendError(err, req = null) {
  const stack = err?.stack || null;
  const parsed = parseStackFrame(stack);
  const user = req?.user || null;
  const userCode =
    user?.user_code || user?.internal_code || (user?.id != null ? String(user.id) : null);
  return {
    source: 'backend',
    app: 'api',
    severity: 'error',
    message: err?.message || 'Erro interno',
    code:
      err?.code && typeof err.code === 'string' && !/^\d+$/.test(err.code)
        ? err.code
        : 'INTERNAL_ERROR',
    file_name: parsed.file_name,
    lineno: parsed.lineno,
    colno: parsed.colno,
    stack_trace: stack,
    url: req ? `${req.originalUrl || req.url || ''}` : null,
    method: req?.method || null,
    status_code: 500,
    user_code: userCode,
    user_agent: req?.headers?.['user-agent'] || null,
    environment: process.env.NODE_ENV || null,
  };
}

module.exports = {
  computeHash,
  parseStackFrame,
  sanitizeText,
  sanitizeMetadata,
  normalizePayload,
  record,
  recordSafe,
  summary,
  top,
  list,
  samplesForHash,
  resolve,
  payloadFromBackendError,
  parsePeriodMs,
};
