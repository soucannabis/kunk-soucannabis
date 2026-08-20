import { test, expect } from '@playwright/test';
import { uniqueEmail, PASSWORD, responsiblePayload, VALID_CPF } from './helpers/fixtures.js';
import { ensureDocSignTemplatesPublished } from './helpers/api.js';
import {
  fillResponsibleForm,
  pickAndUploadJpeg,
  uploadTinyJpeg,
  openIframeContactInNewTabAndSubmit,
} from './helpers/forms.js';
import { deleteAssociateByEmail, deleteReceptionByEmail } from './helpers/db.js';

test.describe('Funil completo — cadastro até contato', () => {
  test('cadastro → docs → termo → extras → finalizar → contato', async ({ page, context }) => {
    test.setTimeout(180_000);

    const email = uniqueEmail('full-funnel');
    const contactEmail = uniqueEmail('full-funnel-contato');
    await ensureDocSignTemplatesPublished(page.context());

    try {
      // 1–2. Acessar cadastramento e criar conta
      await page.goto('/cadastro');
      await expect(page.getByRole('heading', { name: /Cadastro de associado/i })).toBeVisible();
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').nth(0).fill(PASSWORD);
      await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
      await page.getByRole('button', { name: /Se cadastrar como Associado/i }).click();
      await expect(page).toHaveURL(/\/bem-vindo/, { timeout: 30_000 });

      // 3. Preencher dados do associado (CPF válido + CIAP aleatório)
      await page.getByRole('link', { name: /Iniciar cadastro/i }).click();
      await expect(page).toHaveURL(/\/cadastro-associado/);
      const payload = responsiblePayload({
        associate_cpf: VALID_CPF,
        ciap_codes: undefined,
        ciap_random: 4,
      });
      await fillResponsibleForm(page, payload);
      await page.getByRole('button', { name: /Salvar e continuar/i }).click();
      await expect(page).toHaveURL(/\/documentos/, { timeout: 30_000 });

      // 4. Enviar documento de identidade (CNH)
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

      // 5. Abrir e assinar o termo (app doc-sign em :4258)
      await expect(page.getByRole('button', { name: /Assinar termo/i })).toBeEnabled({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: /Assinar termo/i }).click();
      await expect(page).toHaveURL(/\/assinar\//, { timeout: 30_000 });
      await expect(page.locator('article.term-sheet')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('h1.term-preview-title')).toBeVisible();
      await expect(page.getByRole('heading', { name: /^Assinatura$/i })).toBeVisible();

      await page.getByRole('button', { name: /^Digitar$/i }).click();
      await page.locator('#typed').fill(`${payload.associate_name} ${payload.associate_last_name}`);
      await page.locator('.sign-consent input[type="checkbox"]').check();
      await expect(page.getByRole('button', { name: /Assinar e concluir/i })).toBeEnabled();
      await page.getByRole('button', { name: /Assinar e concluir/i }).click();
      await expect(page.getByText(/Termo assinado com sucesso|já assinado/i)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page).toHaveURL(/\/finalizar/, { timeout: 30_000 });

      // 6. Enviar um arquivo por tipo (receita, exame, laudo)
      await page.getByRole('button', { name: /^Anexar documentos$/i }).click();
      await expect(page.getByRole('heading', { name: /Receitas/i })).toBeVisible();

      for (const inputId of ['extra-prescription', 'extra-exam', 'extra-report']) {
        await uploadTinyJpeg(page, inputId);
        await expect(page.locator(`#${inputId}`)).toBeEnabled({ timeout: 20_000 });
      }
      await expect(page.getByText(/3 arquivos/i)).toBeVisible({ timeout: 30_000 });

      // 7. Finalizar cadastro
      await page.getByRole('button', { name: /Finalizar cadastro/i }).click();
      await expect(page).toHaveURL(/\/cadastro-concluido/, { timeout: 20_000 });
      await expect(page.getByText(/Cadastro concluído/i)).toBeVisible();

      // 8. Contato: formulário embutido em /contato (link da conclusão aponta ao Kunk app)
      await page.goto('/contato');
      await expect(page).toHaveURL(/\/contato/, { timeout: 20_000 });

      await openIframeContactInNewTabAndSubmit(page, context, {
        name: payload.associate_name,
        last_name: payload.associate_last_name,
        email: contactEmail,
        phone: payload.mobile_number,
        message: 'E2E funil completo: solicitação de contato',
        patient_name: `${payload.associate_name} Paciente`,
      });
      await expect(page.getByText(/Carregando formulário/i)).toHaveCount(0);
    } finally {
      await deleteReceptionByEmail(contactEmail);
      await deleteAssociateByEmail(email);
    }
  });
});
