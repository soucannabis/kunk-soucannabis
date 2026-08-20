import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { dismissAdminPrompts, gotoAuthenticated } from './helpers/api.js';

function makeValidCpf(seed) {
  const base = String(100000000 + (Number(seed) % 899999999)).padStart(9, '0').slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(base[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  const partial = `${base}${d1}`;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(partial[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  const digits = `${partial}${d2}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

test.describe('importação de associados', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('fluxo completo: upload → mapear → validar → importar', async ({ page }) => {
    const stamp = Date.now();
    const cpf = makeValidCpf(stamp);
    const csvContent = [
      'Nome,Sobrenome,E-mail,CPF,Celular,CEP,UF,Cidade',
      `E2E,Importada,e2e-import-${stamp}@test.local,${cpf},11987654321,01310100,SP,São Paulo`,
    ].join('\n');

    await gotoAuthenticated(page, '/kunk/importacao');

    await expect(page.getByRole('heading', { name: /^Importação de dados$/i })).toBeVisible({
      timeout: 20000,
    });

    await page.setInputFiles('input[type="file"]', {
      name: `associados-e2e-${stamp}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf8'),
    });

    await expect(page.getByRole('heading', { name: /Mapear colunas/i })).toBeVisible({
      timeout: 15000,
    });

    await dismissAdminPrompts(page);
    await expect(page.getByText('Sessão inválida ou expirada')).toHaveCount(0);

    const validateResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/users/import/validate') &&
        res.request().method() === 'POST' &&
        res.status() === 200
    );
    await page.getByRole('button', { name: /Validar dados/i }).click();
    await validateResponse;

    await expect(page.getByRole('heading', { name: '3. Validação' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/1 linha\(s\) válida\(s\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Importar 1 registro/i })).toBeEnabled();

    await page.getByRole('button', { name: /Importar 1 registro/i }).click();
    await expect(page.getByRole('heading', { name: /Resultado da importação/i })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/Importação concluída/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Nova importação/i })).toBeVisible();
  });

  test('página lista link de exemplo e etapas', async ({ page }) => {
    await gotoAuthenticated(page, '/kunk/importacao');
    await expect(page.getByRole('heading', { name: /^Importação de dados$/i })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('link', { name: /associados-import-exemplo\.csv/i })).toBeVisible();
    await expect(page.getByText('Arquivo', { exact: true })).toBeVisible();
    await expect(page.getByText('Mapeamento', { exact: true })).toBeVisible();
  });
});
