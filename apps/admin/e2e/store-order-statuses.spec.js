import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { gotoAuthenticated, dismissAdminPrompts } from './helpers/api.js';

test.describe('loja status pedidos', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre status e salva', async ({ page }) => {
    await gotoAuthenticated(page, '/loja/status-pedidos');
    await expect(page.getByTestId('order-statuses-form')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Status dos pedidos' })).toBeVisible();
    await dismissAdminPrompts(page);
    await page.getByTestId('save-order-statuses').click();
    await expect(page.getByTestId('save-order-statuses')).toBeEnabled({ timeout: 10000 });
  });
});
