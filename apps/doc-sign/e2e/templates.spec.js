import { test, expect } from '@playwright/test';
import { prepareDocSignE2e } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { gotoAuthenticated, loginInBrowser } from './helpers/api.js';

test.describe('termos e modelos', () => {
  test.beforeAll(async () => {
    await prepareDocSignE2e();
  });

  test('lista termos', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/termos'));
    await expect(page.getByRole('heading', { name: 'Termos', exact: true })).toBeVisible();
  });

  test('lista modelos e abre editor self', async ({ page }) => {
    await gotoAuthenticated(page, '/modelos');
    await expect(page.getByRole('heading', { name: /Modelos de termo/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('a[href="/modelos/self"]').click();
    await expect(page).toHaveURL(/\/modelos\/self/);
    await expect(page.getByRole('heading', { name: /Editar modelo/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
