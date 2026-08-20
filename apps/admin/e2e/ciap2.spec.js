import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('ciap2', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre módulo CIAP-2', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/kunk/ciap2'));
    await expect(page.getByRole('heading', { name: 'Módulo CIAP-2' })).toBeVisible();
    await expect(page.getByText(/Habilitar módulo CIAP-2/i)).toBeVisible();
  });
});
