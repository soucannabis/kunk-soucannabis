import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { loginInBrowser, expectLoggedInShell } from './helpers/api.js';

test.describe('shell', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('sidebar mostra seções mantidas e omite removidas', async ({ page }) => {
    await loginInBrowser(page);
    const sidebar = page.getByTestId('kunk-sidebar');
    await expect(sidebar).toBeVisible();
    await expectLoggedInShell(page);
    await expect(sidebar.getByText('Acolhimento', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Loja', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Profissionais', { exact: true }).first()).toBeVisible();
    await expect(sidebar.getByText('Relatórios', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Sistema', { exact: true })).toBeVisible();
    await expect(sidebar.getByRole('menuitem', { name: 'Dashboard' })).toBeVisible();
    await expect(sidebar.getByRole('menuitem', { name: 'Histórico do sistema' })).toBeVisible();
    await expect(sidebar.getByRole('menuitem', { name: 'Tags' })).toBeVisible();

    await expect(sidebar.getByText('Painel geral')).toHaveCount(0);
    await expect(sidebar.getByText('Beeviral Analytics')).toHaveCount(0);
    await expect(sidebar.getByText('Webmaster')).toHaveCount(0);
    await expect(sidebar.getByText('Nibo Dashboard')).toHaveCount(0);
    await expect(sidebar.getByText('Serviço Social')).toHaveCount(0);
    await expect(sidebar.getByText('Usuários', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText('Usuários do sistema')).toHaveCount(0);
  });
});
