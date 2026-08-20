import { test, expect } from '@playwright/test';

test.describe('roadmap · portal profissional', () => {
  test('rota portal exige auth ou redireciona', async ({ page }) => {
    await page.goto('/relatorio/servicos');
    await expect(page).toHaveURL(/\/(login|relatorio\/servicos)/);
  });
});
