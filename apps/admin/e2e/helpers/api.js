import { expect } from '@playwright/test';
import { API_URL, ADMIN_EMAIL, ADMIN_PASSWORD, appUrl } from './fixtures.js';

export function createApi(request) {
  async function json(method, path, body) {
    const headers = { 'X-Kunk-App': 'admin' };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await request.fetch(`${API_URL}${path}`, {
      method,
      headers,
      data: body ? JSON.stringify(body) : undefined,
      failOnStatusCode: false,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status(), body: data, headers: res.headers() };
  }

  return {
    json,
    login: (email, password) => json('POST', '/auth/login', { email, password }),
    logout: () => json('POST', '/auth/logout', {}),
    me: () => json('GET', '/auth/me'),
  };
}

const AUTH_URL_PATTERN = /\/(home|kunk|dados|armazenamento|usuarios|webhooks|loja|servicos-externos|inicio)/;

/** Login via browser context so app-scoped session cookie is available to the page. */
export async function loginInBrowser(page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(appUrl('/login'));
    await page.getByLabel('E-mail').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel('E-mail').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(AUTH_URL_PATTERN, { timeout: 30000 });
    await dismissAdminPrompts(page);

    const onLogin = page.url().includes('/login');
    const sessionInvalid = await page.getByText('Sessão inválida ou expirada').count();
    if (!onLogin && sessionInvalid === 0) {
      await expect(page.locator('.admin-nav')).toBeVisible({ timeout: 15000 });
      return;
    }
    if (attempt === 0) continue;
    throw new Error('loginInBrowser: sessão não estabelecida após retry');
  }
}

/** Fecha prompts de onboarding do Admin (e-mail, armazenamento) se aparecerem. */
export async function dismissAdminPrompts(page) {
  for (let i = 0; i < 5; i++) {
    let dismissed = false;

    const emailDialog = page.getByRole('dialog', { name: 'Configurar módulo de e-mail' });
    const emailVisible = await emailDialog
      .waitFor({ state: 'visible', timeout: i === 0 ? 10000 : 2000 })
      .then(() => true)
      .catch(() => false);
    if (emailVisible) {
      await emailDialog
        .getByRole('button', { name: 'Configurar depois' })
        .click({ timeout: 8000 })
        .catch(() => {});
      dismissed = true;
    }

    const storageDialog = page.getByRole('dialog', { name: 'Configurar armazenamento' });
    const storageVisible = await storageDialog
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (storageVisible) {
      await storageDialog.getByRole('button', { name: 'Não' }).click({ timeout: 8000 }).catch(() => {});
      dismissed = true;
    }

    if (!dismissed) break;
  }
}

async function isLoginPage(page) {
  if (page.url().includes('/login')) return true;
  return page.locator('.login-page').isVisible().catch(() => false);
}

/** Login + navegação autenticada com retry se sessão cair no goto. */
export async function gotoAuthenticated(page, path, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await loginInBrowser(page, email, password);
    await page.goto(appUrl(path), { waitUntil: 'domcontentloaded' });
    await dismissAdminPrompts(page);
    await page.waitForLoadState('networkidle').catch(() => {});

    if (!(await isLoginPage(page))) {
      await expect(page.getByText('Sessão inválida ou expirada')).toHaveCount(0);
      return;
    }
    if (attempt === 0) continue;
    throw new Error(`gotoAuthenticated: redirecionado para login ao acessar ${path}`);
  }
}
