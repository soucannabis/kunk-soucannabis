import { test, expect } from '@playwright/test';
import { uniqueEmail, API_URL, PASSWORD } from './helpers/fixtures.js';
import { seedAssociate } from './helpers/api.js';
import { pickAndUploadJpeg } from './helpers/forms.js';
import {
  requireActiveCloudBucket,
  expectedFileUrl,
  assertFileViewableApi,
  assertFileVisibleInBrowser,
  TINY_JPEG,
} from './helpers/storageCloud.js';

const ASSOCIATE_PATCH = {
  responsible_type: 'himself',
  associate_name: 'Storage',
  associate_last_name: 'View',
  associate_birth_date: '1990-01-15',
  gender: 'mulher-cis',
  nationality: 'Brasileiro(a)',
  associate_cpf: '52998224725',
  associate_rg: '1234567',
  associate_rg_issuer: 'SSP/SP',
  marital_status: 'Solteiro(a)',
  mobile_number: '5511999999999',
  street: 'Rua A',
  street_number: '100',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  cep: '01310100',
  reason_treatment_text: 'teste',
  ciap_codes: 'A01',
};

test.describe('armazenamento cloud — bucket ativo', () => {
  test('associado: upload CNH no S3 e visualização via API', async ({ playwright }) => {
    const { driver } = await requireActiveCloudBucket(playwright, API_URL);
    const ctx = await playwright.request.newContext();
    try {
      const email = uniqueEmail('cloud-view');
      const reg = await ctx.post(`${API_URL}/auth/associate/register-email`, {
        data: { email, password: PASSWORD },
        failOnStatusCode: false,
      });
      expect(reg.status(), await reg.text()).toBe(201);

      const patch = await ctx.patch(`${API_URL}/users/me`, {
        data: ASSOCIATE_PATCH,
        failOnStatusCode: false,
      });
      expect(patch.status()).toBe(200);
      const adv = await ctx.post(`${API_URL}/users/me/advance`, { failOnStatusCode: false });
      expect(adv.status()).toBe(200);

      const up = await ctx.post(`${API_URL}/files`, {
        multipart: {
          file: { name: 'cnh-front.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
          doc_type: 'cnh',
          side: 'front',
          subject: 'responsible',
          doc_kind: 'identity',
        },
        failOnStatusCode: false,
      });
      expect(up.status(), await up.text()).toBe(201);
      const body = await up.json();
      const file = body.data;
      expect(file?.id).toBeTruthy();
      expect(file.url).toBe(expectedFileUrl(file.id));
      expect(file.storage_driver).toBe(driver);

      await assertFileViewableApi(ctx, API_URL, file.id, { driver, expectedBuffer: TINY_JPEG });

      const status = await ctx.get(`${API_URL}/users/me/documents/status`, { failOnStatusCode: false });
      expect(status.status()).toBe(200);
      const statusBody = await status.json();
      expect(statusBody.data?.complete).toBe(true);

      await ctx.delete(`${API_URL}/files/${file.id}`, { failOnStatusCode: false });
    } finally {
      await ctx.dispose();
    }
  });

  test('UI: preview Enviado após upload CNH e arquivo visível no browser', async ({
    page,
    playwright,
  }) => {
    await requireActiveCloudBucket(playwright, API_URL);

    const email = uniqueEmail('cloud-ui');
    await seedAssociate(page, { email, phase: 3 });
    await page.goto('/documentos');
    await expect(page.getByRole('heading', { name: /Documentos de identidade/i })).toBeVisible();

    await page.getByRole('radio', { name: /CNH \(aberta\)/i }).click();
    await pickAndUploadJpeg(page, 'responsible-front', 'Responsável');
    await expect(page.locator('.docs-preview-badge').filter({ hasText: 'Enviado' })).toBeVisible({
      timeout: 20_000,
    });

    const img = page.locator('.docs-preview-frame img').first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', /\/files\/[0-9a-f-]{36}\/download/);

    const src = await img.getAttribute('src');
    const fileId = src.match(/\/files\/([0-9a-f-]{36})\/download/)?.[1];
    expect(fileId).toBeTruthy();

    const api = page.context().request;
    await assertFileViewableApi(api, API_URL, fileId, { expectedBuffer: TINY_JPEG });
    await assertFileVisibleInBrowser(page, api, API_URL, fileId);
  });
});
