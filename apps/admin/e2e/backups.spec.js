import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './helpers/fixtures.js';
import { loginInBrowser } from './helpers/api.js';

test.describe('backups', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('mostra card de backup na página de armazenamento', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/armazenamento#backup'));
    await expect(page.getByRole('heading', { name: 'Armazenamento e Backup' })).toBeVisible();

    const card = page.getByTestId('storage-backup-card');
    // Card só aparece com driver cloud ou is_cloud; em local puro pode estar oculto
    const visible = await card.isVisible().catch(() => false);
    if (!visible) {
      // Em disco local sem cloud, a UI esconde o card — ainda assim a página e o hash devem carregar
      await expect(page.getByText(/Driver ativo/i)).toBeVisible({ timeout: 20_000 });
      test.info().annotations.push({
        type: 'note',
        description: 'Card de backup oculto (driver local sem cloud) — esperado',
      });
      return;
    }

    await expect(card.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
    await expect(card.getByText(/Últimos backups/i)).toBeVisible();
    await expect(card.locator('#backup-enabled')).toBeVisible();
    await expect(card.locator('#backup-time')).toBeVisible();
    await expect(card.getByTestId('storage-backup-run')).toBeVisible();
  });
});
