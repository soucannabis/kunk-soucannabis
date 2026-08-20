import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('armazenamento', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre página e mostra status do driver', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/armazenamento'));
    await expect(page.getByRole('heading', { name: 'Armazenamento e Backup' })).toBeVisible();
    await expect(page.getByTestId('storage-status-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Driver ativo/i)).toBeVisible();
    await expect(page.getByTestId('storage-config-card')).toBeVisible();
    await expect(page.locator('#storage-driver')).toBeVisible();
  });
});
