import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';

test.describe('roadmap · nova senha', () => {
  test('página nova senha carrega', async ({ page }) => {
    await ensureAdminUser();
    await page.goto(appUrl('/nova-senha'));
    await expect(page.locator('form, input').first()).toBeVisible({ timeout: 15_000 });
  });
});
