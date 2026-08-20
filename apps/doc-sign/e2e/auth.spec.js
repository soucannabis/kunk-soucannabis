import { test, expect } from '@playwright/test';
import { prepareDocSignE2e } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { expectLoggedInShell, loginInBrowser } from './helpers/api.js';

test.describe('auth', () => {
  test.beforeAll(async () => {
    await prepareDocSignE2e();
  });

  test('login com Administrador entra em Termos', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/termos/);
    await expectLoggedInShell(page);
    await expect(page.getByRole('heading', { name: 'Termos', exact: true })).toBeVisible();
  });

  test('credencial inválida mostra erro', async ({ page }) => {
    await page.goto(appUrl('/login'));
    await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('.auth-login-alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout volta para login', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expectLoggedInShell(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
