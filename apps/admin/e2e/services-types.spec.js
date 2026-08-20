import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('tipos de profissional', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre config de tipos e relatório', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/kunk/configuracao-profissionais'));
    await expect(
      page.getByRole('heading', { name: /Configuração de profissionais/i })
    ).toBeVisible();
  });
});
