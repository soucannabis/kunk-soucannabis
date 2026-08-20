import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('orders page', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('lista pedidos e carrega contagens', async ({ page }) => {
    await loginInBrowser(page);
    await page.goto('/app/loja/pedidos');
    await expect(page.getByTestId('orders-page')).toBeVisible();
    await expect(
      page.getByTestId('orders-page').getByRole('heading', { name: 'Pedidos', exact: true })
    ).toBeVisible();
    await expect(page.getByTestId('orders-filters')).toBeVisible();
    await page.getByTestId('show-status-counts').click();
    await expect(page.getByTestId('orders-facets')).toBeVisible({ timeout: 15000 });
  });
});
