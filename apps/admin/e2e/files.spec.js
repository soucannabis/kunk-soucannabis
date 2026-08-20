import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('arquivos (legado)', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('/arquivos redireciona para banco de dados', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/arquivos'));
    await expect(page).toHaveURL(/\/dados\/?$/);
    await expect(page.getByRole('heading', { name: 'Banco de dados' })).toBeVisible();
  });
});
