import { test, expect } from '@playwright/test';

/** JPEG mínimo válido para multipart. */
export const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@kunk-api.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'TestAdmin123!';

export function expectedFileUrl(id) {
  return `/api/v1/files/${id}/download`;
}

export async function assertFileViewableApi(request, apiUrl, fileId, {
  driver,
  expectedBuffer = TINY_JPEG,
  expectedMime = 'image/jpeg',
} = {}) {
  const meta = await request.get(`${apiUrl}/files/${fileId}`, { failOnStatusCode: false });
  expect(meta.status(), 'GET /files/:id').toBe(200);
  const metaBody = await meta.json();
  expect(metaBody.data.url).toBe(expectedFileUrl(fileId));
  if (driver) expect(metaBody.data.storage_driver).toBe(driver);

  const dl = await request.get(`${apiUrl}/files/${fileId}/download`, { failOnStatusCode: false });
  expect(dl.status(), 'GET /files/:id/download').toBe(200);
  expect(dl.headers()['content-type']).toContain(expectedMime);
  expect(String(dl.headers()['content-disposition'] || '')).toMatch(/^inline/i);
  expect(dl.headers()['x-content-type-options']).toBe('nosniff');
  const bytes = Buffer.from(await dl.body());
  expect(bytes.equals(expectedBuffer)).toBe(true);
  return metaBody.data;
}

export async function assertFileVisibleInBrowser(page, request, apiUrl, fileId) {
  const state = await request.storageState();
  if (state.cookies?.length) {
    await page.context().addCookies(state.cookies);
  }
  const response = await page.goto(`${apiUrl}/files/${fileId}/download`, { waitUntil: 'load' });
  expect(response?.status(), 'browser GET download').toBe(200);
  expect(response?.headers()['content-type'] || '').toContain('image/jpeg');
}

/**
 * Confirma bucket S3/GCS ativo via API admin (contexto isolado).
 * Faz `test.skip` se o driver for local ou se o login falhar.
 */
export async function requireActiveCloudBucket(playwright, apiUrl) {
  if (process.env.E2E_STORAGE_CLOUD !== '1') {
    test.skip(true, 'Storage cloud E2E: defina E2E_STORAGE_CLOUD=1 (fora da bateria principal)');
  }
  const ctx = await playwright.request.newContext();
  try {
    const login = await ctx.post(`${apiUrl}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'X-Kunk-App': 'admin' },
      failOnStatusCode: false,
    });
    if (login.status() !== 200) {
      test.skip(true, `Login admin falhou (${login.status()}) — não dá para checar bucket`);
    }
    const res = await ctx.get(`${apiUrl}/admin/storage`, { failOnStatusCode: false });
    const body = await res.json().catch(() => ({}));
    const driver = String(body.data?.driver || '').toLowerCase();
    if (driver !== 's3' && driver !== 'gcs') {
      test.skip(true, `Bucket cloud não ativo (driver=${driver || 'unknown'})`);
    }
    return { driver, status: body.data };
  } finally {
    await ctx.dispose();
  }
}
