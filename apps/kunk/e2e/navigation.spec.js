import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { loginInBrowser, expectLoggedInShell } from './helpers/api.js';

/**
 * Substitui expectativas de stub ("Module under development") pelas páginas reais.
 */
test.describe('navigation', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test.beforeEach(async ({ page }) => {
    await loginInBrowser(page);
    await expectLoggedInShell(page);
  });

  function sidebar(page) {
    return page.getByTestId('kunk-sidebar');
  }

  /** Expande seção sem fechar se o item alvo já estiver visível (sidebar usa toggle). */
  async function navigateToMenuItem(page, sectionLabel, itemName) {
    const menu = sidebar(page);
    const item = menu.getByRole('menuitem', { name: itemName }).first();
    if (!(await item.isVisible())) {
      await menu.getByText(sectionLabel, { exact: true }).click();
      await expect(item).toBeVisible();
    }
    await item.scrollIntoViewIfNeeded();
    await item.evaluate((el) => el.click());
  }

  test('navega Associados → associados', async ({ page }) => {
    if (!page.url().includes('/app/acolhimento/associados')) {
      await navigateToMenuItem(page, 'Acolhimento', 'Associados');
    }
    await expect(page).toHaveURL(/\/app\/acolhimento\/associados/);
    await expect(page.getByPlaceholder(/Nome, e-mail ou telefone/i)).toBeVisible({ timeout: 20_000 });
  });

  test('navega Triagem → fila', async ({ page }) => {
    await navigateToMenuItem(page, 'Acolhimento', 'Triagem');
    await expect(page).toHaveURL(/\/app\/acolhimento\/triagem/);
    await expect(page.getByLabel('Status')).toBeVisible({ timeout: 20_000 });
  });

  test('navega Pedidos → listagem', async ({ page }) => {
    await navigateToMenuItem(page, 'Loja', 'Pedidos');
    await expect(page).toHaveURL(/\/app\/loja\/pedidos/);
    await expect(page.getByTestId('orders-page')).toBeVisible();
  });

  test('navega Atendimentos → listagem', async ({ page }) => {
    await navigateToMenuItem(page, 'Acolhimento', 'Atendimentos');
    await expect(page).toHaveURL(/\/app\/acolhimento\/servicos/);
    await expect(page.getByRole('button', { name: /Novo Atendimento/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('navega Produtos → listagem', async ({ page }) => {
    await navigateToMenuItem(page, 'Loja', 'Produtos');
    await expect(page).toHaveURL(/\/app\/loja\/produtos/);
    await expect(page.getByRole('button', { name: /Novo produto/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('QuickNav Pedidos funciona', async ({ page }) => {
    await page.getByRole('button', { name: 'Pedidos' }).click();
    await expect(page).toHaveURL(/\/app\/loja\/pedidos/);
  });
});
