import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

async function openClientSecretForEdit(page) {
  const display = page.getByTestId('cred-display-client_secret');
  if (await display.isVisible().catch(() => false)) {
    await page.getByTestId('cred-edit-client_secret').click();
  }
  return page.getByTestId('cred-client_secret');
}

test.describe('servicos externos', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('lista e form de secret não reexibe valor; teste falho não salva', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.locator('.admin-nav .brand')).toHaveText('Kunk Admin');
    await page.goto(appUrl('/servicos-externos/loggi'));
    await expect(page.getByRole('heading', { name: /loggi/i })).toBeVisible();

    await expect(page.getByTestId('use-for-quote')).toBeVisible();
    await expect(page.getByTestId('use-for-label')).toBeVisible();

    const secret = await openClientSecretForEdit(page);
    await expect(secret).toHaveAttribute('type', 'password');
    await expect(secret).toHaveValue('');
    await expect(secret).toHaveAttribute('placeholder', /Cole o client secret/i);

    // Intercept PUT credentials to simulate test failure (API would not persist)
    await page.route('**/api/v1/admin/external-services/loggi/credentials', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [{ code: 'CREDENTIAL_INVALID', message: 'Teste falhou — mock e2e' }],
          }),
        });
        return;
      }
      await route.continue();
    });

    await secret.fill('should-not-persist');
    await page.getByTestId('save-credentials').click();
    await expect(page.getByTestId('ext-error')).toContainText(/Teste falhou|não foi persistido|CREDENTIAL|falhou/i);

    // Input cleared or still local-only; secret never displayed from server
    await expect(secret).toHaveAttribute('type', 'password');
  });
});
