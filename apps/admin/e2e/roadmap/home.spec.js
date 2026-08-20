import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser, dismissAdminPrompts } from '../helpers/api.js';

test.describe('roadmap · home', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('home mostra status dos serviços', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await dismissAdminPrompts(page);
    await page.goto(appUrl('/home'));
    await expect(page.getByTestId('admin-home')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByTestId('home-refresh')).toBeVisible();
  });
});
