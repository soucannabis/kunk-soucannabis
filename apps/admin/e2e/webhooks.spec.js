import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { gotoAuthenticated, dismissAdminPrompts } from './helpers/api.js';

test.describe('webhooks', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('cria, edita e exclui webhook pela UI', async ({ page }) => {
    const stamp = Date.now();
    const name = `e2e-webhook-${stamp}`;
    const updatedName = `${name}-editado`;

    await gotoAuthenticated(page, '/webhooks');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await dismissAdminPrompts(page);

    await page.getByTestId('webhook-name').fill(name);
    await page.getByTestId('webhook-url').fill(`https://example.com/hooks/${stamp}`);
    await page.getByLabel('Associados').check();
    await page.getByLabel('Criar').check();
    await page.getByRole('button', { name: 'Criar' }).click();

    await expect(page.getByTestId('webhook-secret-plaintext')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('webhook-secret-plaintext')).toContainText(/^whsec_/);
    await page.getByTestId('webhook-secret-close').click();
    await expect(page.getByTestId('webhook-secret-plaintext')).toHaveCount(0);

    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText('Associados');
    await expect(row).toContainText('Criar');
    await expect(row).toContainText('Ativo');
    await expect(row).toContainText('secret');

    await row.getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar webhook' })).toBeVisible();
    await expect(page.getByTestId('webhook-name')).toHaveValue(name);
    await page.getByTestId('webhook-name').fill(updatedName);
    await page.getByLabel('Atualizar').check();
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByTestId('webhook-feedback-success')).toContainText(/Webhook atualizado/i);
    const editedRow = page.locator('tbody tr', { hasText: updatedName }).first();
    await expect(editedRow).toBeVisible({ timeout: 15000 });
    await expect(editedRow).toContainText('Atualizar');

    page.once('dialog', (dialog) => dialog.accept());
    await editedRow.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId('webhook-feedback-success')).toContainText(/Webhook excluído/i);
    await expect(page.locator('tbody tr', { hasText: updatedName })).toHaveCount(0);
  });

  test('testa entrega e mostra execuções recentes', async ({ page }) => {
    const stamp = Date.now();
    const name = `e2e-test-hook-${stamp}`;

    await page.route('**/api/v1/admin/webhooks/*/test', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ok: true,
            message: 'Teste entregue com sucesso.',
            delivery: {
              id: 9001,
              table_name: 'ping',
              action: 'test',
              status: 'delivered',
            },
          },
          errors: null,
        }),
      });
    });

    await page.route('**/api/v1/admin/webhooks/*/deliveries?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 9001,
              date_created: '2026-01-01T12:00:00.000Z',
              table_name: 'ping',
              action: 'test',
              status: 'delivered',
              attempts: 1,
              max_attempts: 5,
              last_http_status: 200,
              last_error: null,
            },
          ],
          errors: null,
        }),
      });
    });

    await gotoAuthenticated(page, '/webhooks');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

    await page.getByTestId('webhook-name').fill(name);
    await page.getByTestId('webhook-url').fill(`https://example.com/test/${stamp}`);
    await page.getByLabel('Pedidos').check();
    await page.getByLabel('Criar').check();
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.getByTestId('webhook-secret-close').click();

    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button', { name: 'Testar' }).click();

    await expect(page.getByTestId('webhook-feedback-success')).toContainText(/Teste entregue com sucesso/i);
    await expect(page.getByRole('heading', { name: 'Últimas execuções' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'ping.test' }).first()).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'delivered' }).first()).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
  });
});
