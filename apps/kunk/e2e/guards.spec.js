import { test, expect } from '@playwright/test';
import { ensureFinanceiroUser } from './helpers/db.js';
import { FINANCEIRO_EMAIL, FINANCEIRO_PASSWORD } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('guards', () => {
  test('sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/app/store/orders');
    await expect(page).toHaveURL(/\/login/);
  });

  test('papel sem permissão vai para unauthorized', async ({ page }) => {
    await ensureFinanceiroUser();
    await loginInBrowser(page, FINANCEIRO_EMAIL, FINANCEIRO_PASSWORD, { expectShell: false });
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
