import { test, expect } from '@playwright/test';
import { getPool, prepareDocSignE2e } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL } from '../helpers/fixtures.js';
import { expectTermosPageReady, gotoAuthenticated } from '../helpers/api.js';

async function loginApi(request) {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    headers: { 'X-Kunk-App': 'doc-sign' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const raw = setCookie
    .map((h) => h.value)
    .find((value) => String(value).startsWith('kunk_oss_session_doc_sign='));
  return raw ? String(raw).split(';')[0] : '';
}

async function ensureSelfTemplatePublished(request) {
  const cookie = await loginApi(request);
  const headers = { Cookie: cookie };
  await request.get(`${API_URL}/doc-sign/templates/self`, { headers });
  await request.post(`${API_URL}/doc-sign/templates/self/publish`, {
    headers,
    data: { notes: 'e2e roadmap criar-termo' },
  });
  return cookie;
}

async function ensureAssociateReadyForTerm() {
  const email = `docsign-e2e-${Date.now()}@test.local`;
  const password = 'TestPass123!';
  const res = await fetch(`${API_URL}/auth/associate/register-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const userCode = json?.data?.user?.user_code;
  const p = getPool();
  await p.query(
    `UPDATE users SET
       associate_status = 'assinatura_termo',
       associate_name = 'E2E',
       associate_last_name = 'CriarTermo',
       associate_cpf = '123.456.789-00',
       associate_rg = '123',
       associate_rg_issuer = 'SSP',
       nationality = 'brasileiro(a)',
       marital_status = 'Solteiro',
       street = 'Rua A',
       street_number = '10',
       city = 'Anápolis',
       neighborhood = 'Centro',
       state = 'GO',
       cep = '75000-000',
       responsible_type = 'himself'
     WHERE user_code = $1`,
    [userCode],
  );
  return { email, userCode };
}

test.describe('roadmap · criar / emitir termo', () => {
  test.beforeAll(async () => {
    await prepareDocSignE2e();
  });

  test('abre modal Novo termo com modelo e busca de associado', async ({ page, request }) => {
    await ensureSelfTemplatePublished(request);
    await gotoAuthenticated(page, '/termos');
    await expectTermosPageReady(page);

    await page.locator('.btn-novo-termo').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Novo termo' })).toBeVisible();
    await expect(dialog.locator('#term-kind')).toBeVisible();
    await expect(dialog.getByLabel(/Buscar associado/i)).toBeVisible();

    const kindSelect = dialog.locator('#term-kind');
    await expect(kindSelect).toBeVisible();
    await expect(kindSelect).not.toHaveValue('');
    await expect(kindSelect.locator('option[value="self"]')).toHaveCount(1);
  });

  test('admin emite termo e recebe signing_url', async ({ page, request }) => {
    const cookie = await ensureSelfTemplatePublished(request);
    const { email, userCode } = await ensureAssociateReadyForTerm();

    const created = await request.post(`${API_URL}/doc-sign/contracts`, {
      headers: { Cookie: cookie },
      data: {
        user_code: userCode,
        kind: 'self',
        regenerate: true,
        send_email: false,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const data = (await created.json())?.data;
    expect(data?.status).toBe('pending');
    expect(String(data?.signing_url || '')).toMatch(/\/assinar\//);

    await gotoAuthenticated(page, '/termos');
    await expectTermosPageReady(page);
    await page.locator('#term-search').fill(email);
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });
});
