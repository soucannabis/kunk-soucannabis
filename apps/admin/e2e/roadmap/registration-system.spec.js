import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser, dismissAdminPrompts } from '../helpers/api.js';

test.describe('roadmap · sistema de cadastro', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre configurações de textos do cadastro', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await dismissAdminPrompts(page);
    await page.goto(appUrl('/sistema-cadastro'));
    await expect(page.getByRole('heading', { name: 'Sistema de cadastro' })).toBeVisible();
    await expect(page.getByText(/Texto de boas-vindas/i)).toBeVisible();
    await expect(page.getByTestId('show-triage-button-toggle')).toBeVisible();
  });
});
