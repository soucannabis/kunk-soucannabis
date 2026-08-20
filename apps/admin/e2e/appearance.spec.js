import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('aparência', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre configuração de aparência do Kunk', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/kunk/aparencia'));
    await expect(page.getByRole('heading', { name: /^Aparência$/i })).toBeVisible();
  });
});
