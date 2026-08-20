import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';

test.describe('Guards de fase', () => {
  test('phase 1 cannot open documentos', async ({ page }) => {
    const email = uniqueEmail('guard1');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/documentos');
    await expect(page).not.toHaveURL(/\/documentos$/);
    await expect(page).toHaveURL(/\/(bem-vindo|cadastro-associado|cadastro|login)/);
  });

  test('phase 3 cannot open cadastro-associado', async ({ page }) => {
    const email = uniqueEmail('guard3');
    await seedAssociate(page, { email, phase: 3 });
    await page.goto('/cadastro-associado');
    await expect(page).toHaveURL(/\/documentos/);
  });

  test('phase 4 stays on documentos stub not finalizar', async ({ page }) => {
    const email = uniqueEmail('guard4');
    await seedAssociate(page, { email, phase: 4 });
    await page.goto('/finalizar');
    await expect(page).not.toHaveURL(/\/finalizar/);
    await expect(page.getByRole('heading', { name: /Assinatura do termo/i })).toBeVisible();
  });

  test('unauthenticated / redirects to cadastro', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/cadastro$/);
  });

  test('root redirects by phase', async ({ page }) => {
    const email = uniqueEmail('root');
    await seedAssociate(page, { email, phase: 3 });
    await page.goto('/');
    await expect(page).toHaveURL(/\/documentos/);
  });
});
