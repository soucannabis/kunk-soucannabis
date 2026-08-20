import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('documentação externa', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test.beforeEach(async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('menu Documentação abre o site oficial em nova aba', async ({ page, context }) => {
    const popupPromise = context.waitForEvent('page');
    await page.locator('.admin-nav').getByTestId('admin-nav-docs-external').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveURL(/kunksoucannabis\.ong\.br/);
  });

  test('rota /inicio redireciona para /home', async ({ page }) => {
    await page.goto(appUrl('/inicio'));
    await expect(page).toHaveURL(/\/home\/?$/);
  });
});
