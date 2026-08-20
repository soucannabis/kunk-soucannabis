import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { gotoAuthenticated, dismissAdminPrompts } from './helpers/api.js';

test.describe('dados', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('CRUD leve em etiquetas', async ({ page }) => {
    await gotoAuthenticated(page, '/dados/tags');
    await expect(page.getByRole('heading', { name: 'Etiquetas' })).toBeVisible({ timeout: 20000 });
    await dismissAdminPrompts(page);

    await page.getByRole('button', { name: 'Configurar campos visíveis' }).click();
    await expect(page.getByRole('heading', { name: 'Campos visíveis' })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Campos visíveis' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Novo registro' }).click();
    const tagName = `e2e-${Date.now()}`;
    const tagInput = page.locator('#f-tag');
    await tagInput.fill(tagName);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page).toHaveURL(/\/dados\/tags\/\d+/);
    await expect(tagInput).toHaveValue(tagName);

    await tagInput.fill(`${tagName}-edit`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salvo.')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Excluir' }).click();
    await expect(page).toHaveURL(/\/dados\/tags$/);
  });
});
