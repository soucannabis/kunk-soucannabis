import { request as playwrightRequest } from '@playwright/test';
import { API_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './fixtures.js';

function pickCep(user) {
  if (!user || typeof user !== 'object') return null;
  return user.cep || null;
}

/**
 * Resolve user_code de associado com endereço para abrir /novo-pedido?u=...
 * Login via APIRequestContext isolado (split-origin front/API no Railway).
 */
export async function findAssociateUserCode() {
  const ctx = await playwrightRequest.newContext();
  try {
    const login = await ctx.post(`${API_URL}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'X-Kunk-App': 'kunk' },
      failOnStatusCode: false,
    });
    if (login.status() !== 200) {
      throw new Error(`Login admin falhou: HTTP ${login.status()}`);
    }
    const res = await ctx.get(
      `${API_URL}/items/users?limit=80&fields=user_code,cep`,
      { headers: { 'X-Kunk-App': 'kunk' }, failOnStatusCode: false }
    );
    if (res.status() !== 200) {
      throw new Error(`Listagem users falhou: HTTP ${res.status()}`);
    }
    const body = await res.json();
    const users = Array.isArray(body.data) ? body.data : [];
    const withCep = users.find((u) => u.user_code && pickCep(u));
    if (withCep?.user_code) return withCep.user_code;
    const any = users.find((u) => u.user_code);
    if (any?.user_code) return any.user_code;
    throw new Error('Nenhum associado com user_code encontrado para e2e cart');
  } finally {
    await ctx.dispose();
  }
}
