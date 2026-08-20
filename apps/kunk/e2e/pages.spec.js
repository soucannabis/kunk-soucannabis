import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { loginInBrowser, expectLoggedInShell } from './helpers/api.js';

test.describe('páginas operacionais', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test.beforeEach(async ({ page }) => {
    await loginInBrowser(page);
    await expectLoggedInShell(page);
  });

  test('associados carrega filtros', async ({ page }) => {
    await page.goto('/app/acolhimento/associados');
    await expect(page.getByRole('button', { name: 'Filtrar' })).toBeVisible({ timeout: 20_000 });
  });

  test('atendimentos carrega listagem', async ({ page }) => {
    await page.goto('/app/acolhimento/servicos');
    await expect(page.getByRole('button', { name: /Novo Atendimento/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('triagem carrega seletor de status', async ({ page }) => {
    await page.goto('/app/acolhimento/triagem');
    await expect(page.getByLabel('Status')).toBeVisible({ timeout: 20_000 });
  });

  test('clientes institucionais carrega', async ({ page }) => {
    await page.goto('/app/acolhimento/clientesinstitucionais');
    await expect(page.getByRole('button', { name: /Novo cliente/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('produtos carrega listagem', async ({ page }) => {
    await page.goto('/app/loja/produtos');
    await expect(page.getByRole('button', { name: /Novo produto/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('carrinho (novo pedido) carrega', async ({ page }) => {
    await page.goto('/app/loja/novo-pedido');
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 20_000 });
  });

  test('profissionais carrega listagem', async ({ page }) => {
    await page.goto('/app/profissionais');
    await expect(page.getByRole('button', { name: /Novo profissional/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('dashboard analytics carrega', async ({ page }) => {
    await page.goto('/app/relatorios/dashboard');
    await expect(
      page.locator('main').getByRole('heading', { name: 'Dashboard', exact: true })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('relatório de serviços carrega', async ({ page }) => {
    await page.goto('/app/relatorios/servicos');
    await expect(page.getByText(/Relatório de atendimentos/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('tags carrega listagem', async ({ page }) => {
    await page.goto('/app/tags');
    await expect(page.getByRole('button', { name: /Nova tag/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('histórico do sistema carrega', async ({ page }) => {
    await page.goto('/app/historico');
    await expect(page.getByLabel('Ação')).toBeVisible({ timeout: 20_000 });
  });

  test('formulário público /contato carrega sem auth staff', async ({ page }) => {
    await page.goto('/contato');
    await expect(page.getByRole('heading', { name: /Fila de acolhimento/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
