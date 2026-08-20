import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('api access', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('página API carrega e permite gerar token', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.locator('.brand')).toHaveText('Kunk Admin', { timeout: 30000 });
    await page.goto(appUrl('/acesso-api'));
    await expect(page.getByRole('heading', { name: 'API', exact: true })).toBeVisible();
    await expect(page.getByTestId('api-enabled-toggle')).toBeVisible();

    const disabledNotice = page.getByTestId('api-disabled-notice');
    if (await disabledNotice.isVisible().catch(() => false)) {
      const toggle = page.getByTestId('api-enabled-toggle').locator('input');
      await toggle.check();
      await page.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByText(/Acesso via API habilitado/i)).toBeVisible({ timeout: 15000 });
    }

    await expect(page.getByTestId('api-scope-matrix')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('api-token-label').fill(`e2e-token-${Date.now()}`);
    await page.getByLabel('Produtos Ler').check();
    await page.getByTestId('api-token-submit').click();

    await expect(page.getByTestId('api-token-plaintext')).toBeVisible();
    const secret = await page.getByTestId('api-token-plaintext').textContent();
    expect(secret).toMatch(/^kunk_live_/);

    await page.getByTestId('api-token-reveal-close').click();
    await expect(page.getByTestId('api-token-plaintext')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('api-tokens-list')).toBeVisible();
    await expect(page.getByTestId('api-tokens-list').locator('li').first()).toBeVisible();
    await expect(page.getByTestId('api-token-plaintext')).toHaveCount(0);
  });
});
