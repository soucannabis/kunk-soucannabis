import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('cache', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre página e permite limpar cache', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/cache'));
    await expect(page.getByRole('heading', { name: 'Cache operacional' })).toBeVisible();
    await expect(page.getByText(/Habilitar cache operacional/i)).toBeVisible();
    await page.getByRole('button', { name: /Limpar cache agora/i }).click();
    await expect(page.getByText(/Cache do servidor limpo/i)).toBeVisible({ timeout: 15_000 });
  });
});
