import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser, dismissAdminPrompts } from '../helpers/api.js';

test.describe('roadmap · dados da associação', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre dados da associação com logo e formulário', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await dismissAdminPrompts(page);
    await page.goto(appUrl('/dados-associacao'));
      await expect(page.getByRole('heading', { name: 'Dados da associação' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Logos' })).toBeVisible();
    await expect(page.locator('#associationName')).toBeVisible();
  });
});
