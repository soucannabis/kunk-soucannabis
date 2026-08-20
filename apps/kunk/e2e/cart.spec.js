import { test, expect } from '@playwright/test';
import { ensureAdminUser } from './helpers/db.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers/fixtures.js';
import { loginInBrowser, expectLoggedInShell } from './helpers/api.js';
import { findAssociateUserCode } from './helpers/cart.js';

test.describe('cart', () => {
  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  test('inputs de desconto/doação/itens/tags e frete mockado; total inconsistente', async ({ page }) => {
    const userCode = await findAssociateUserCode();

    await loginInBrowser(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expectLoggedInShell(page);

    await page.route('**/api/v1/freight/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            apply_to_total: true,
            default_option_key: 'loggi:FREIGHT_TYPE_ECONOMIC',
            selected_option_key: 'loggi:FREIGHT_TYPE_ECONOMIC',
            options: [
              {
                option_key: 'loggi:FREIGHT_TYPE_ECONOMIC',
                provider: 'loggi',
                service_label: 'Loggi Econômico',
                price: 15,
                eta_days: 5,
                status: 'ready',
              },
            ],
          },
          errors: null,
        }),
      });
    });

    await page.route('**/api/v1/orders', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.total && body.items?.length) {
          const products = body.items.reduce(
            (s, it) => s + Number(it.amount) * Number(it.quantity),
            0
          );
          const expected =
            products +
            (Number(body.delivery_price) || 0) -
            (Number(body.discount) || 0) -
            (Number(body.donation) || 0);
          if (Math.abs(Number(body.total) - expected) > 0.01) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                data: null,
                errors: [
                  {
                    code: 'TOTAL_MISMATCH',
                    message: `Total informado (${body.total}) diverge do calculado (${expected})`,
                  },
                ],
              }),
            });
            return;
          }
        }
      }
      await route.continue();
    });

    await page.goto(`/app/loja/novo-pedido?u=${encodeURIComponent(userCode)}`);
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cart-missing-user')).toHaveCount(0);

    await page.getByTestId('add-manual-item').evaluate((el) => el.click());
    await expect(page.getByTestId('item-qty-0')).toBeVisible();

    await page.getByTestId('discount').locator('input').fill('2');
    await page.getByTestId('donation').locator('input').fill('1');
    await page.getByTestId('order-info').locator('input').fill('Obs e2e');
    await page.getByTestId('order-tags').locator('input').fill('tag1');
    await page.getByTestId('order-tags').locator('input').press('Enter');

    await page.getByTestId('quote-freight').click();
    await expect(page.getByText(/Loggi/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByTestId('submit-wrong-total').evaluate((el) => el.click());
    await expect(page.getByTestId('global-error-message')).toContainText(/diverge|TOTAL_MISMATCH|Total informado/i);
  });
});
