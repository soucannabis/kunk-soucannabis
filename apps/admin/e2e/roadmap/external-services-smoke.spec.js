import { test, expect } from '@playwright/test';
import { ensureAdminUser } from '../helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from '../helpers/fixtures.js';
import { loginInBrowser, dismissAdminPrompts } from '../helpers/api.js';

const SERVICES = [
  { grep: 'visão geral', path: '/servicos-externos', heading: /Serviços externos/i },
  { grep: 'dados de envio', path: '/servicos-externos/envio', heading: /envio|Dados de envio/i },
  { grep: 'e-mail', path: '/servicos-externos/email', heading: /e-?mail/i },
  { grep: 'pagarme', path: '/servicos-externos/pagarme', heading: /pagar\.?me/i },
  { grep: 'melhor envio', path: '/servicos-externos/melhorenvio', heading: /melhor/i },
  { grep: 'soucannabis', path: '/servicos-externos/soucannabis_orders', heading: /soucannabis|pedidos/i },
  { grep: 'utalk', path: '/servicos-externos/utalk', heading: /utalk/i },
  { grep: 'google calendar', path: '/servicos-externos/google_calendar', heading: /google|calendar|calendário/i },
  { grep: 'geoapify', path: '/servicos-externos/geoapify', heading: /geoapify|endereço|validador/i },
];

test.describe('roadmap · serviços externos smoke', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  for (const svc of SERVICES) {
    test(`abre ${svc.grep}`, async ({ page }) => {
      await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await dismissAdminPrompts(page);
      await page.goto(appUrl(svc.path));
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('h1, h2').first()).toBeVisible();
    });
  }
});
