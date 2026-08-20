import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('erros do sistema', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre listagem de erros', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/erros-sistema'));
    await expect(page.getByRole('heading', { name: 'Erros do sistema' })).toBeVisible();
    await expect(page.getByText(/Eventos inesperados|agrupados|hash/i).first()).toBeVisible();
  });
});
