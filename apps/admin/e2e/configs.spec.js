import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('configs (legado)', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('/configs redireciona para armazenamento', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/configs'));
    await expect(page).toHaveURL(/\/armazenamento/);
  });
});
