import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('triagem (config admin)', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('formulário — campos padrão', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/triagem/formulario'));
    await expect(page.getByRole('heading', { name: 'Campos padrão' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('status da fila', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/triagem/status'));
    await expect(page.getByRole('heading', { name: 'Status da fila' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('módulos', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/triagem/modulos'));
    await expect(page.getByRole('heading', { name: 'Módulos' })).toBeVisible({
      timeout: 20_000,
    });
  });
});
