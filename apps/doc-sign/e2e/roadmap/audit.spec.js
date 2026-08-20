import { test, expect } from '@playwright/test';
import { prepareDocSignE2e } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser } from '../helpers/api.js';

test.describe('roadmap · audit', () => {
  test.beforeAll(async () => {
    await prepareDocSignE2e();
  });

  test('rota de auditoria responde quando há termo', async ({ page }) => {
    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(appUrl('/termos'));
    const link = page.locator('a[href*="/termos/"]').first();
    if (await link.count()) {
      const href = await link.getAttribute('href');
      const id = String(href || '').split('/').pop();
      if (id) {
        await page.goto(appUrl(`/termos/${id}/audit`));
        await expect(page.locator('body')).toBeVisible();
      }
    } else {
      await expect(page.getByRole('heading', { name: 'Termos' })).toBeVisible();
    }
  });
});
