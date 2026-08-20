import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';
import {
  requireActiveCloudBucket,
  uploadDocument,
  expectedFileUrl,
  assertFileViewableApi,
  assertFileVisibleInBrowser,
  TINY_JPEG,
} from './helpers/storageCloud.js';

test.describe('armazenamento cloud — bucket ativo', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('upload, metadados, download inline e visualização no browser', async ({
    page,
    request,
    playwright,
  }) => {
    const { driver } = await requireActiveCloudBucket(playwright);

    const login = await request.post(`${API_URL}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'X-Kunk-App': 'admin' },
      failOnStatusCode: false,
    });
    expect(login.status()).toBe(200);

    const filename = `admin-cloud-${Date.now()}.jpg`;
    const up = await uploadDocument(request, { filename, buffer: TINY_JPEG });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.data?.id).toBeTruthy();
    expect(up.data.url).toBe(expectedFileUrl(up.data.id));
    expect(up.data.storage_driver).toBe(driver);
    expect(up.data.storage_key).toBeTruthy();
    expect(String(up.data.storage_key)).not.toMatch(/^\/|^[A-Za-z]:\\/);

    await assertFileViewableApi(request, API_URL, up.data.id, {
      driver,
      expectedBuffer: TINY_JPEG,
    });

    const listed = await request.get(`${API_URL}/files?limit=20`, { failOnStatusCode: false });
    expect(listed.status()).toBe(200);
    const listBody = await listed.json();
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.some((f) => f.id === up.data.id)).toBe(true);

    await assertFileVisibleInBrowser(page, request, API_URL, up.data.id);

    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/home\/?$/);

    await request.delete(`${API_URL}/files/${up.data.id}`, { failOnStatusCode: false });
  });
});
