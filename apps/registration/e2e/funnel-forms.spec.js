import { test, expect } from '@playwright/test';
import { uniqueEmail, responsiblePayload, patientPayload } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';
import { fillResponsibleForm, fillPatientForm, fillLabeledInput } from './helpers/forms.js';

test.describe('Funil — dados do responsável e paciente', () => {
  test('bem-vindo → form → documentos (himself)', async ({ page }) => {
    const email = uniqueEmail('himself');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/bem-vindo');
    await page.getByRole('link', { name: /Iniciar cadastro/i }).click();
    await expect(page).toHaveURL(/\/cadastro-associado/);

    await fillResponsibleForm(page, responsiblePayload());
    await page.getByRole('button', { name: /Salvar e continuar/i }).click();
    await expect(page).toHaveURL(/\/documentos/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Documentos de identidade/i })).toBeVisible();
  });

  test('partial save keeps valid fields and shows invalid', async ({ page }) => {
    const email = uniqueEmail('partial');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/cadastro-associado');
    await expect(page.getByRole('heading', { name: /Dados do responsável/i })).toBeVisible();
    await fillLabeledInput(page, 'Nome', 'Ana');
    await fillLabeledInput(page, 'CPF', '000');
    await page.getByRole('button', { name: /Salvar e continuar/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/cadastro-associado/);
    // reload — API should have kept name
    await page.reload();
    await expect(page.getByRole('textbox').first()).toHaveValue('Ana');
  });

  test('another → paciente → documentos', async ({ page }) => {
    const email = uniqueEmail('another');
    await seedAssociate(page, { email, phase: 1 });
    await page.goto('/cadastro-associado');
    await fillResponsibleForm(page, responsiblePayload({ responsible_type: 'another' }));
    await page.getByRole('button', { name: /Salvar e continuar/i }).click();
    await expect(page).toHaveURL(/\/cadastro-paciente/, { timeout: 30_000 });

    await fillPatientForm(page, patientPayload());
    await expect(page.getByRole('textbox').first()).toHaveValue('João');

    const waitAdvance = page.waitForResponse(
      (r) => r.url().includes('/users/me/advance') && r.request().method() === 'POST',
      { timeout: 30_000 }
    );
    await page.getByRole('button', { name: /Salvar e continuar/i }).click();
    const advRes = await waitAdvance;
    expect(advRes.ok(), `advance status ${advRes.status()}`).toBeTruthy();
    await expect(page).toHaveURL(/\/documentos/, { timeout: 30_000 });
  });
});
