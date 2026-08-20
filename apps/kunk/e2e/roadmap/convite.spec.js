import { test, expect } from '@playwright/test';

test.describe('roadmap · convite', () => {
  test('página de cadastro/convite carrega', async ({ page }) => {
    await page.goto('/cadastro');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveURL(/\/(cadastro|login)/);
  });
});
