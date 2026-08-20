import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { uniqueEmail } from './helpers/fixtures.js';
import { gotoAuthenticated } from './helpers/api.js';

test.describe('users', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('cria e edita operador', async ({ page }) => {
    await gotoAuthenticated(page, '/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();

    await page.getByRole('link', { name: 'Convidar usuário' }).click();
    await expect(page.getByLabel('Selecione um profissional')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prescritor' })).toHaveCount(0);
    const email = uniqueEmail('ui');
    await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Oper');
    await page.getByRole('textbox', { name: 'Sobrenome' }).fill('E2E');
    await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
    await page.getByRole('button', { name: 'Acolhimento' }).click();
    await page.getByRole('button', { name: 'Criar e enviar convite' }).click();

    await expect(page.getByTestId('invite-result')).toBeVisible();
    await page.getByRole('link', { name: 'Abrir operador' }).click();
    await expect(page).toHaveURL(/\/usuarios\/\d+/);
    await expect(page.getByRole('textbox', { name: 'E-mail' })).toHaveValue(email);

    await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Operador');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Salvo.')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Desativar' }).click();
    await expect(page.locator('#status')).toHaveValue('inactive');
  });
});
