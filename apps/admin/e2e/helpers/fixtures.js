function resolveFrontUrl() {
  const raw = String(process.env.E2E_FRONT_URL || '').trim().replace(/\/$/, '');
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return 'http://localhost:4256';
}

export const FRONT_URL = resolveFrontUrl();
export const API_URL = (() => {
  const raw = String(process.env.E2E_API_URL || '').trim().replace(/\/$/, '');
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return `${FRONT_URL}/api/v1`;
})();

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!';

export const ACOL_EMAIL = process.env.E2E_ACOL_EMAIL || 'acolhimento@kunk-api.test';
export const ACOL_PASSWORD = process.env.E2E_ACOL_PASSWORD || 'TestAcol123!';

/** URL absoluta do Admin (não depende de baseURL do Playwright). */
export function appUrl(path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FRONT_URL}${p}`;
}

export function uniqueEmail(prefix = 'op') {
  return `${prefix}-${Date.now()}@admin-e2e.local`;
}

/** Ambiente remoto (Railway) — instalação fresh e TRUNCATE não se aplicam. */
export function isRemoteE2e() {
  return /^https?:\/\/(?!localhost)/i.test(FRONT_URL);
}
