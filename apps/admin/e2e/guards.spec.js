import { test, expect } from '@playwright/test';
import { ensureAcolhimentoUser, ensureAdminUser } from './helpers/db.js';
import { ACOL_EMAIL, ACOL_PASSWORD } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('guards', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
    await ensureAcolhimentoUser();
  });

  test('operador sem Administrador vê sem permissão', async ({ page }) => {
    await loginInBrowser(page, ACOL_EMAIL, ACOL_PASSWORD);
    await expect(page).toHaveURL(/\/sem-permissao/);
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
  });
});
