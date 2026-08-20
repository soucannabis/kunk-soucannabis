export const FRONT_URL = process.env.E2E_FRONT_URL || 'http://localhost:4258';
export const API_URL = process.env.E2E_API_URL || `${FRONT_URL}/api/v1`;

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!';

export function appUrl(path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FRONT_URL}${p}`;
}
