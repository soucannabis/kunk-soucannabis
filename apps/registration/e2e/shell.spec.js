import { test, expect } from '@playwright/test';

/**
 * Smoke leve — o funil completo já está em auth/guards/funnel/documents/phase5.
 */
test.describe('shell público', () => {
  test('visitante em / vai para cadastro', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/cadastro$/);
  });

  test('página de cadastro carrega por padrão', async ({ page }) => {
    await page.goto('/cadastro');
    await expect(page.getByRole('heading', { name: 'Cadastro de associado' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Se cadastrar/i })).toBeVisible();
  });

  test('página de login carrega', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
