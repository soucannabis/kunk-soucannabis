import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('permissões de acesso Kunk', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('abre matriz de permissões', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/kunk/permissoes'));
    await expect(page.getByRole('heading', { name: /Permissões de acesso/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administrador' })).toBeVisible();
    await expect(page.getByText('list.find is not a function')).toHaveCount(0);
  });
});
