import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser, dismissAdminPrompts } from '../helpers/api.js';

test.describe('roadmap · credenciais de suporte', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre página de credenciais de suporte', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await dismissAdminPrompts(page);
    await page.goto(appUrl('/credenciais-suporte'));
    await expect(page.getByRole('heading', { name: /Credenciais de suporte/i })).toBeVisible();
  });
});
