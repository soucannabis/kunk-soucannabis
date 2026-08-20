'use strict';

const { env } = require('../config/env');
const { publicApiBase } = require('../utils/publicApiUrl');

const PROBE_TIMEOUT_MS = 4000;

/** Hosts internos Docker para probe quando a URL pública é localhost. */
const DOCKER_PROBE_BASE = {
  api: 'http://127.0.0.1',
  admin: 'http://admin:4256',
  kunk: 'http://kunk:4257',
  registration: 'http://registration:4255',
  'doc-sign': 'http://doc-sign:4258',
};

function stripSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

function isLoopback(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function serviceCatalog(req) {
  const apiPublic = stripSlash(publicApiBase(req));
  const apiPort = env.port || Number(process.env.PORT) || 8056;

  return [
    {
      id: 'api',
      label: 'API',
      url: apiPublic,
      healthPath: '/api/v1/health',
      probeBases: [
        apiPublic,
        `http://127.0.0.1:${apiPort}`,
        DOCKER_PROBE_BASE.api ? `${DOCKER_PROBE_BASE.api}:${apiPort}` : null,
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      url: env.publicUrls.admin,
      healthPath: '/health',
      probeBases: [env.publicUrls.admin, DOCKER_PROBE_BASE.admin],
    },
    {
      id: 'kunk',
      label: 'Kunk',
      url: env.publicUrls.kunk,
      healthPath: '/health',
      probeBases: [env.publicUrls.kunk, DOCKER_PROBE_BASE.kunk],
    },
    {
      id: 'registration',
      label: 'Cadastro',
      url: env.publicUrls.registration,
      healthPath: '/health',
      probeBases: [env.publicUrls.registration, DOCKER_PROBE_BASE.registration],
    },
    {
      id: 'doc-sign',
      label: 'Assinatura',
      url: env.publicUrls.docSign,
      healthPath: '/health',
      probeBases: [env.publicUrls.docSign, DOCKER_PROBE_BASE['doc-sign']],
    },
  ];
}

async function fetchHealth(healthUrl) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { online: false, status: res.status, latency_ms: ms, error: `HTTP ${res.status}` };
    }
    return { online: true, status: res.status, latency_ms: ms, error: null };
  } catch (err) {
    return {
      online: false,
      status: null,
      latency_ms: Date.now() - started,
      error: err.name === 'AbortError' ? 'timeout' : err.message || 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeService(service) {
  const bases = [...new Set((service.probeBases || []).map(stripSlash).filter(Boolean))];
  // Prefer docker/internal when public is loopback (API inside compose).
  const ordered = isLoopback(service.url)
    ? [...bases].sort((a, b) => Number(isLoopback(a)) - Number(isLoopback(b)))
    : bases;

  let last = { online: false, status: null, latency_ms: null, error: 'unreachable' };
  for (const base of ordered) {
    const healthUrl = `${base}${service.healthPath}`;
    last = await fetchHealth(healthUrl);
    if (last.online) {
      return {
        id: service.id,
        label: service.label,
        url: service.url,
        health_url: `${stripSlash(service.url)}${service.healthPath}`,
        online: true,
        status: last.status,
        latency_ms: last.latency_ms,
        error: null,
      };
    }
  }

  return {
    id: service.id,
    label: service.label,
    url: service.url,
    health_url: `${stripSlash(service.url)}${service.healthPath}`,
    online: false,
    status: last.status,
    latency_ms: last.latency_ms,
    error: last.error,
  };
}

async function getSystemHealth(req) {
  const catalog = serviceCatalog(req);
  const services = await Promise.all(catalog.map((s) => probeService(s)));
  return {
    checked_at: new Date().toISOString(),
    services,
    online_count: services.filter((s) => s.online).length,
    total: services.length,
  };
}

module.exports = {
  getSystemHealth,
  serviceCatalog,
  PROBE_TIMEOUT_MS,
};
