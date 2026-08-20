import { test, expect } from '@playwright/test';
import { uniqueEmail, PASSWORD } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';

test.describe('Auth — cadastro, login, reset', () => {
  test('register email → bem-vindo', async ({ page }) => {
    const email = uniqueEmail('reg');
    await page.goto('/cadastro');
    await expect(page.getByRole('heading', { name: /Cadastro de associado/i })).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole('button', { name: /Se cadastrar como Associado/i }).click();
    await expect(page).toHaveURL(/\/bem-vindo/);
    await expect(page.getByRole('heading', { name: /Bem-vindo/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Iniciar cadastro/i })).toBeVisible();
  });

  test('session persists after reload', async ({ page }) => {
    const email = uniqueEmail('persist');
    await page.goto('/cadastro');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole('button', { name: /Se cadastrar como Associado/i }).click();
    await expect(page).toHaveURL(/\/bem-vindo/);
    await page.reload();
    await expect(page).toHaveURL(/\/bem-vindo/);
    await expect(page.getByRole('button', { name: /Sair/i })).toBeVisible();
  });

  test('register duplicate shows error and login link path', async ({ page }) => {
    const email = uniqueEmail('dup');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/cadastro');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole('button', { name: /Se cadastrar como Associado/i }).click();
    await expect(page.getByRole('alert')).toContainText(/andamento|login|existe/i);
  });

  test('login with password after register', async ({ page }) => {
    const email = uniqueEmail('login');
    const { api } = await seedAssociate(page, { email, phase: 1 });
    await api.logout();
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /^Entrar$/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /Sair/i })).toBeVisible();
  });

  test('nova-senha forgot flow shows generic success', async ({ page }) => {
    await page.goto('/nova-senha');
    await page.locator('input[type="email"]').fill(uniqueEmail('forgot'));
    await page.getByRole('button', { name: /Enviar link/i }).click();
    await expect(page.getByText(/Se o e-mail existir/i)).toBeVisible();
  });

  test('nova-senha reset with API token', async ({ page }) => {
    const email = uniqueEmail('reset');
    const { api } = await seedAssociate(page, { email, phase: 2 });
    await api.logout();

    // forgot via API returns reset_token only when NODE_ENV=test — use DB-less path:
    // call forgot from page.request; if no token, skip reset UI with token from API in test env
    const forgot = await api.forgotPassword(email);
    const token = forgot.data?.data?.reset_token;
    test.skip(!token, 'reset_token indisponível — API remota sem NODE_ENV=test (fora da bateria principal)');

    await page.goto('/nova-senha');
    await page.getByRole('button', { name: /Já tenho o token/i }).click();
    await page.locator('input').nth(0).fill(token);
    await page.locator('input[type="password"]').nth(0).fill('novaSenha99');
    await page.locator('input[type="password"]').nth(1).fill('novaSenha99');
    await page.getByRole('button', { name: /Redefinir/i }).click();
    await expect(page.getByText(/Senha atualizada/i)).toBeVisible();
  });

  test('logout clears session', async ({ page }) => {
    const email = uniqueEmail('out');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/bem-vindo');
    await expect(page.getByRole('button', { name: /Sair/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Sair/i }).click();
    await page.goto('/bem-vindo');
    await expect(page).toHaveURL(/\/cadastro$/);
  });
});
