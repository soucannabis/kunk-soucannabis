import { expect } from '@playwright/test';
import { API_URL, PASSWORD } from './fixtures.js';

function apiOrigin() {
  return new URL(API_URL).origin;
}

/**
 * Injeta associate_session no jar do browser a partir do Set-Cookie da resposta API.
 */
export async function syncAssociateSessionFromResponse(page, apiResponse) {
  if (!apiResponse?.headersArray) return;

  const origin = apiOrigin();
  const setCookies = apiResponse
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);

  for (const raw of setCookies) {
    const match = raw.match(/^associate_session=([^;]+)/);
    if (!match) continue;
    await page.context().addCookies([
      {
        name: 'associate_session',
        value: match[1],
        url: `${origin}/`,
        httpOnly: true,
        secure: origin.startsWith('https:'),
        sameSite: 'Lax',
      },
    ]);
  }
}

/**
 * Garante que o React AssociateAuthProvider hidrata user após seed via API (produção split-origin).
 * @param {{ refresh?: boolean }} [opts] — logout antes do login (sessão desatualizada após mutação API).
 */
export async function hydrateAssociateInBrowser(page, email, password = PASSWORD, { refresh = false } = {}) {
  if (refresh) {
    await page.context().request.post(`${API_URL}/auth/associate/logout`, {
      failOnStatusCode: false,
    });
  }
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}
