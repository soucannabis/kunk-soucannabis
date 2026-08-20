import { expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './fixtures.js';

export async function expectLoggedInShell(page) {
  await expect(page).toHaveURL(/\/app\//, { timeout: 30000 });
  await expect(page.getByTestId('kunk-sidebar')).toBeVisible({ timeout: 30000 });
}

export async function loginInBrowser(
  page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
  { expectShell = true } = {}
) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  if (expectShell) {
    await expectLoggedInShell(page);
  }
}
