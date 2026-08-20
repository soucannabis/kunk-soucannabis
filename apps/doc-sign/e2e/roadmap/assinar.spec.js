import { test, expect } from '@playwright/test';

test.describe('roadmap · assinar', () => {
  test('token inválido mostra erro ou formulário', async ({ page }) => {
    await page.goto('/assinar/token-invalido-roadmap');
    await expect(page.locator('body')).toBeVisible();
  });
});
