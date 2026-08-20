import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('web vitals', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre painel de métricas', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/web-vitals'));
    await expect(page.getByRole('heading', { name: 'Web Vitals' })).toBeVisible();
  });
});
