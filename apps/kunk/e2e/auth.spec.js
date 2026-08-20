import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers/fixtures.js';
import { loginInBrowser, expectLoggedInShell } from './helpers/api.js';

test.describe('auth', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('login com Administrador entra no shell', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expectLoggedInShell(page);
  });

  test('credencial inválida mostra erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
    await page.locator('#password').fill('WrongPass1!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout volta para login', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expectLoggedInShell(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
