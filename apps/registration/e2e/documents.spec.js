import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';
import { pickAndUploadJpeg, uploadTinyJpeg } from './helpers/forms.js';

test.describe('Documentos — assistente RG/CNH e fase 4', () => {
  test('CNH upload completes and advances to terms signing CTA', async ({ page }) => {
    const email = uniqueEmail('cnh');
    await seedAssociate(page, { email, phase: 3 });
    await page.goto('/documentos');
    await expect(page.getByRole('heading', { name: /Documentos de identidade/i })).toBeVisible();

    await page.getByRole('radio', { name: /CNH \(aberta\)/i }).click();
    await pickAndUploadJpeg(page, 'responsible-front', 'Responsável');
    await expect(page.getByRole('button', { name: /Avançar para assinatura/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /Avançar para assinatura/i }).click();
    await expect(page.getByRole('heading', { name: /Assinatura do termo/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /Assinar termo/i })).toBeVisible({ timeout: 20_000 });
  });

  test('RG requires front and back', async ({ page }) => {
    const email = uniqueEmail('rg');
    await seedAssociate(page, { email, phase: 3 });
    await page.goto('/documentos');

    await page.getByRole('radio', { name: /RG \(frente e verso\)/i }).click();
    await uploadTinyJpeg(page, 'responsible-front');
    await expect(page.getByRole('button', { name: /^Enviar documentos$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Avançar para assinatura/i })).toHaveCount(0);

    await uploadTinyJpeg(page, 'responsible-back');
    await page.getByRole('button', { name: /^Enviar documentos$/i }).click();
    await expect(page.getByRole('button', { name: /Avançar para assinatura/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('another requires patient docs too', async ({ page }) => {
    const email = uniqueEmail('docs-pat');
    await seedAssociate(page, { email, phase: 3, responsibleType: 'another' });
    await page.goto('/documentos');

    await page.getByRole('radio', { name: /CNH \(aberta\)/i }).first().click();
    await pickAndUploadJpeg(page, 'responsible-front', 'Responsável');
    await expect(page.getByRole('button', { name: /Avançar para assinatura/i })).toHaveCount(0);

    await page.locator('#patient-front').waitFor({ state: 'attached' });
    const patientBlock = page.locator('section.docs-subject').filter({ hasText: 'Paciente' });
    await patientBlock.getByRole('radio', { name: /CNH/i }).click();
    await pickAndUploadJpeg(page, 'patient-front', 'Paciente');
    await expect(page.getByRole('button', { name: /Avançar para assinatura/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('phase 4 shows signing CTA (not stub)', async ({ page }) => {
    const email = uniqueEmail('phase4');
    await seedAssociate(page, { email, phase: 4 });
    await page.goto('/documentos');
    await expect(page.getByRole('heading', { name: /Assinatura do termo/i })).toBeVisible();
    await expect(page.getByText(/em desenvolvimento/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Assinar termo/i })).toBeVisible({ timeout: 20_000 });
  });
});
