import { test, expect } from '@playwright/test';

test.describe('roadmap · nova senha', () => {
  test('página nova senha carrega', async ({ page }) => {
    await page.goto('/nova-senha');
    await expect(page.locator('form, input').first()).toBeVisible({ timeout: 15_000 });
  });
});
