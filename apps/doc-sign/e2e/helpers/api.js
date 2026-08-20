import { expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './fixtures.js';

const AUTH_URL_PATTERN = /\/termos/;

async function isLoggedIn(page) {
  if (page.url().includes('/login')) return false;
  return page.getByRole('button', { name: 'Sair' }).isVisible().catch(() => false);
}

/** Confirma shell autenticado (evita falso positivo com título da tela de login). */
export async function expectLoggedInShell(page) {
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Termos' })).toBeVisible();
}

/** Login via browser com retry se a sessão não estabilizar. */
export async function loginInBrowser(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  if (await isLoggedIn(page)) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(appUrl('/login'));
    await page.getByLabel('E-mail').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByLabel('E-mail').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(AUTH_URL_PATTERN, { timeout: 30_000 });
    await expectLoggedInShell(page);

    if (!page.url().includes('/login')) return;
    if (attempt === 0) continue;
    throw new Error('loginInBrowser: sessão não estabelecida após retry');
  }
}

/** Login + navegação autenticada com retry se sessão cair no goto. */
export async function gotoAuthenticated(page, path, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  if (!(await isLoggedIn(page))) {
    await loginInBrowser(page, email, password);
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (page.url().includes(normalized) && (await isLoggedIn(page))) {
    await expectLoggedInShell(page);
    return;
  }

  await page.goto(appUrl(normalized));
  if (page.url().includes('/login')) {
    await loginInBrowser(page, email, password);
    await page.goto(appUrl(normalized));
  }
  await expect(page).not.toHaveURL(/\/login/);
  await expectLoggedInShell(page);
}

/** Aguarda a lista de termos carregar (toolbar com busca e CTA Novo termo). */
export async function expectTermosPageReady(page) {
  await expect(page.getByRole('heading', { name: 'Termos', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('#term-search')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.btn-novo-termo')).toBeVisible({ timeout: 15_000 });
}
