import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';
import { hydrateAssociateInBrowser } from './helpers/session.js';

test.describe('Pós-termo — finalizar e conclusão', () => {
  test('finalizar → concluir → cadastro-concluido', async ({ page }) => {
    const email = uniqueEmail('fase5');
    const { user } = await seedAssociate(page, { email, phase: 5 });
    expect(user?.status).toBe('Associado');
    expect(user?.associate_status).toBe('assinatura_termo');

    await page.goto('/finalizar');
    await expect(page.getByRole('heading', { name: /Finalizar cadastro/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Agendar consulta/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Anexar documentos$/i })).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(0);

    await page.getByRole('button', { name: /^Anexar documentos$/i }).click();
    await expect(page.getByRole('heading', { name: /Receitas/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Exames/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Laudos/i })).toBeVisible();

    await page.getByRole('button', { name: /Finalizar cadastro/i }).click();
    await expect(page).toHaveURL(/\/cadastro-concluido/, { timeout: 20_000 });
    await expect(page.getByText(/Cadastro concluído/i)).toBeVisible();
    await expect(page.getByText(/cadastro foi realizado com sucesso/i)).toBeVisible();
  });

  test('consulta redireciona para finalizar', async ({ page }) => {
    const email = uniqueEmail('fase5-alias');
    await seedAssociate(page, { email, phase: 5 });
    await page.goto('/consulta');
    await expect(page).toHaveURL(/\/finalizar/);
  });

  test('home redirects concluido to cadastro-concluido', async ({ page }) => {
    const email = uniqueEmail('done');
    await seedAssociate(page, { email, phase: 5 });
    const { forceAssociateStatus } = await import('./helpers/db.js');
    await forceAssociateStatus(email, { status: 'Associado', associate_status: 'concluido' });
    await hydrateAssociateInBrowser(page, email, undefined, { refresh: true });
    await page.goto('/');
    await expect(page).toHaveURL(/\/cadastro-concluido/);
  });
});
