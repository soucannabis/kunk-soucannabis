'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

const ALLOWED_NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const ALLOWED_RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const MAX_URL = 2000;
const MAX_PATH = 500;

function truncate(value, max) {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function parsePeriodMs(period) {
  const raw = String(period || '7d').trim().toLowerCase();
  const m = raw.match(/^(\d+)(h|d|w)$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'w') return n * 7 * 24 * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

function normalizePath(urlOrPath) {
  if (!urlOrPath) return null;
  const raw = String(urlOrPath).trim();
  if (!raw) return null;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return truncate(new URL(raw).pathname || '/', MAX_PATH);
    }
  } catch {
    /* fall through */
  }
  const pathOnly = raw.split('?')[0].split('#')[0];
  return truncate(pathOnly || '/', MAX_PATH);
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
    if (typeof v === 'string') out[k] = truncate(v, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = truncate(JSON.stringify(v), 500);
  }
  return Object.keys(out).length ? out : null;
}

function normalizePayload(payload = {}) {
  const name = String(payload.name || '').trim().toUpperCase();
  if (!ALLOWED_NAMES.has(name)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'name deve ser LCP, INP, CLS, FCP ou TTFB');
  }
  const value = Number(payload.value);
  if (!Number.isFinite(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'value deve ser um número finito');
  }

  let rating = payload.rating != null ? String(payload.rating).trim().toLowerCase() : null;
  if (rating && !ALLOWED_RATINGS.has(rating)) rating = null;

  let delta = payload.delta != null ? Number(payload.delta) : null;
  if (delta != null && !Number.isFinite(delta)) delta = null;

  let device_memory =
    payload.device_memory != null ? Number(payload.device_memory) : null;
  if (device_memory != null && !Number.isFinite(device_memory)) device_memory = null;

  const url = truncate(payload.url, MAX_URL);
  const path =
    normalizePath(payload.path) ||
    normalizePath(url) ||
    null;

  const metadata = sanitizeMetadata({
    ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
    ...(payload.id ? { metric_id: String(payload.id).slice(0, 120) } : {}),
  });

  return {
    name,
    value,
    rating,
    delta,
    navigation_type: truncate(payload.navigation_type || payload.navigationType, 64),
    app: truncate(payload.app, 64),
    url,
    path,
    user_code: truncate(payload.user_code, 120),
    user_agent: truncate(payload.user_agent, 500),
    connection_type: truncate(payload.connection_type, 64),
    device_memory,
    metadata,
  };
}

async function record(payload) {
  const row = normalizePayload(payload);
  const result = await query(
    `INSERT INTO web_vitals (
       name, value, rating, delta, navigation_type, app, url, path,
       user_code, user_agent, connection_type, device_memory, metadata, date_created
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW()
     ) RETURNING id, name, value, rating, path, date_created`,
    [
      row.name,
      row.value,
      row.rating,
      row.delta,
      row.navigation_type,
      row.app,
      row.url,
      row.path,
      row.user_code,
      row.user_agent,
      row.connection_type,
      row.device_memory,
      row.metadata == null ? null : JSON.stringify(row.metadata),
    ],
  );
  return result.rows[0];
}

async function recordSafe(payload) {
  try {
    return await record(payload);
  } catch (err) {
    console.error('[webVitalsService.recordSafe]', err.message || err);
    return null;
  }
}

async function recordMany(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'body deve ser um objeto ou array de métricas');
  }
  const out = [];
  for (const item of items.slice(0, 20)) {
    out.push(await record(item));
  }
  return out;
}

async function summary({ period = '7d', app = null } = {}) {
  const since = new Date(Date.now() - parsePeriodMs(period));
  const params = [since.toISOString()];
  let appClause = '';
  if (app) {
    params.push(String(app));
    appClause = `AND app = $${params.length}`;
  }
  const result = await query(
    `SELECT
       name,
       COUNT(*)::int AS count,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS p50,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95,
       AVG(CASE WHEN rating = 'good' THEN 1.0 ELSE 0.0 END) AS good_ratio
     FROM web_vitals
     WHERE date_created >= $1
     ${appClause}
     GROUP BY name
     ORDER BY name`,
    params,
  );
  return {
    period,
    metrics: result.rows.map((r) => ({
      name: r.name,
      count: r.count,
      p50: r.p50 != null ? Number(r.p50) : null,
      p75: r.p75 != null ? Number(r.p75) : null,
      p95: r.p95 != null ? Number(r.p95) : null,
      good_ratio: r.good_ratio != null ? Number(r.good_ratio) : null,
    })),
  };
}

async function series({ period = '7d', name = 'LCP', app = null } = {}) {
  const metric = String(name || 'LCP').trim().toUpperCase();
  if (!ALLOWED_NAMES.has(metric)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'name inválido');
  }
  const ms = parsePeriodMs(period);
  const since = new Date(Date.now() - ms);
  const bucket = ms > 3 * 24 * 60 * 60 * 1000 ? 'day' : 'hour';
  const trunc = bucket === 'day' ? 'day' : 'hour';
  const params = [since.toISOString(), metric];
  let appClause = '';
  if (app) {
    params.push(String(app));
    appClause = `AND app = $${params.length}`;
  }
  const result = await query(
    `SELECT
       date_trunc('${trunc}', date_created) AS bucket,
       COUNT(*)::int AS count,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75
     FROM web_vitals
     WHERE date_created >= $1 AND name = $2
     ${appClause}
     GROUP BY 1
     ORDER BY 1`,
    params,
  );
  return {
    period,
    name: metric,
    bucket,
    points: result.rows.map((r) => ({
      bucket: r.bucket,
      count: r.count,
      p75: r.p75 != null ? Number(r.p75) : null,
    })),
  };
}

async function byPage({ period = '7d', name = 'LCP', limit = 20, app = null } = {}) {
  const metric = String(name || 'LCP').trim().toUpperCase();
  if (!ALLOWED_NAMES.has(metric)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'name inválido');
  }
  const since = new Date(Date.now() - parsePeriodMs(period));
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const params = [since.toISOString(), metric];
  let appClause = '';
  if (app) {
    params.push(String(app));
    appClause = `AND app = $${params.length}`;
  }
  params.push(lim);
  const result = await query(
    `SELECT
       COALESCE(path, '(unknown)') AS path,
       COUNT(*)::int AS count,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
       AVG(CASE WHEN rating = 'good' THEN 1.0 ELSE 0.0 END) AS good_ratio
     FROM web_vitals
     WHERE date_created >= $1 AND name = $2
     ${appClause}
     GROUP BY 1
     HAVING COUNT(*) >= 1
     ORDER BY p75 DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((r) => ({
    path: r.path,
    count: r.count,
    p75: r.p75 != null ? Number(r.p75) : null,
    good_ratio: r.good_ratio != null ? Number(r.good_ratio) : null,
  }));
}

module.exports = {
  ALLOWED_NAMES,
  normalizePayload,
  normalizePath,
  parsePeriodMs,
  record,
  recordSafe,
  recordMany,
  summary,
  series,
  byPage,
};
