import { createElement, Fragment } from 'react';

/**
 * Status unificado dos serviços externos (menu, banner, overview).
 *
 * kind: ok | authenticated | disabled | unauthenticated | warning | error
 */

export const EXT_SERVICE_SLUGS = [
  'loggi',
  'melhorenvio',
  'geoapify',
  'google_calendar',
  'email',
  'pagarme',
  'soucannabis_orders',
  'utalk',
];

/** Frete / transportadoras (submenu Transportadoras). */
export const EXT_FREIGHT_SLUGS = ['loggi', 'melhorenvio'];

export const EXT_OTHER_SLUGS = EXT_SERVICE_SLUGS.filter((s) => !EXT_FREIGHT_SLUGS.includes(s));

export const EXT_SERVICE_LABELS = {
  loggi: 'Loggi',
  melhorenvio: 'Melhor Envio',
  geoapify: 'Validador de endereço',
  google_calendar: 'Google Calendar',
  email: 'E-mail',
  pagarme: 'Pagar.me',
  soucannabis_orders: 'Pedidos SouCannabis',
  utalk: 'Utalk',
  envio: 'Dados de envio',
};

const AUTH_HINT_FIELDS = [
  'access_token',
  'refresh_token',
  'secret_key',
  'api_key',
  'api_token',
  'client_secret',
  'pass',
  'client_id',
];

function creds(data) {
  return Array.isArray(data?.credentials) ? data.credentials : [];
}

function hasFailedTest(data) {
  return creds(data).some((c) => c.has_value && c.last_test_ok === false);
}

function hasAnyCredential(data) {
  return creds(data).some((c) => c.has_value && AUTH_HINT_FIELDS.includes(c.field_key));
}

function isAuthenticated(data) {
  if (!data) return false;
  if (data.oauth && typeof data.oauth.authenticated === 'boolean') {
    return data.oauth.authenticated;
  }
  if (data.pagarme_status?.credentials_complete) return true;
  if (data.sc_status?.ready) return true;
  if (hasAnyCredential(data)) {
    const tested = creds(data).filter((c) => c.has_value && AUTH_HINT_FIELDS.includes(c.field_key));
    if (tested.some((c) => c.last_test_ok === true)) return true;
    if (tested.every((c) => c.last_test_ok == null)) return true;
  }
  return false;
}

/** Público: módulo tem autenticação válida (OAuth/credenciais). */
export function isExternalServiceAuthenticated(data) {
  return isAuthenticated(data);
}

/**
 * @param {object|null} data - payload de GET /admin/external-services/:service ou item da lista
 * @param {{ storeIncomplete?: object }} [opts]
 */
export function deriveExternalServiceStatus(data, opts = {}) {
  if (!data) {
    return {
      kind: 'warning',
      label: 'Indefinido',
      detail: 'Status ainda não carregado.',
    };
  }

  if (hasFailedTest(data)) {
    return {
      kind: 'error',
      label: 'Erro de autenticação',
      detail: 'O último teste de conexão falhou. Revise as credenciais e autentique de novo.',
    };
  }

  if (
    (data.service === 'melhorenvio' || data.service === 'loggi') &&
    data.store_freight_ready === false
  ) {
    return {
      kind: 'warning',
      label: 'Dados de envio incompletos',
      detail: createElement(
        Fragment,
        null,
        'Preencha ',
        createElement('strong', null, 'Dados de envio'),
        ' antes de ativar o frete.'
      ),
    };
  }

  const enabled = Boolean(data.enabled);
  const authed = isAuthenticated(data);

  if (
    data.service === 'pagarme' &&
    enabled &&
    authed &&
    !data.pagarme_status?.webhooks?.ready
  ) {
    return {
      kind: 'ok',
      label: 'Ativo',
      detail: 'Módulo habilitado. Webhooks ainda não validados (passo 3) — recomendado para atualizar pagamentos automaticamente.',
      enabled: true,
      authenticated: true,
    };
  }

  if (authed && enabled) {
    return {
      kind: 'ok',
      label: 'Ativo',
      detail: 'Módulo habilitado e autenticado.',
      enabled: true,
      authenticated: true,
    };
  }

  if (authed) {
    return {
      kind: 'authenticated',
      label: 'Autenticado',
      detail: 'Credenciais autenticadas. Ative o módulo quando quiser usá-lo.',
      enabled: false,
      authenticated: true,
    };
  }

  if (!enabled) {
    return {
      kind: 'disabled',
      label: 'Desabilitado',
      detail: 'Módulo desligado e sem autenticação válida.',
      enabled: false,
      authenticated: false,
    };
  }

  return {
    kind: 'unauthenticated',
    label: 'Não autenticado',
    detail: 'Módulo habilitado, mas ainda sem credenciais/autorização válidas.',
    enabled: true,
    authenticated: false,
  };
}

/** Status da página Dados de envio (não é um módulo API). */
export function deriveShippingStatus(storeIncomplete) {
  if (!storeIncomplete) {
    return {
      kind: 'warning',
      label: 'Indefinido',
      detail: 'Não foi possível verificar os dados de envio.',
    };
  }
  const missing = [
    storeIncomplete.ship_from && 'remetente',
    storeIncomplete.package && 'caixa',
    storeIncomplete.content_declaration && 'declaração',
  ].filter(Boolean);
  if (missing.length) {
    return {
      kind: 'warning',
      label: 'Incompleto',
      detail: `Faltando: ${missing.join(', ')}.`,
    };
  }
  return {
    kind: 'ok',
    label: 'Completo',
    detail: 'Remetente, caixa e declaração preenchidos.',
  };
}

export function statusTitle(kind) {
  switch (kind) {
    case 'ok':
      return 'Tudo certo';
    case 'authenticated':
      return 'Autenticado';
    case 'disabled':
      return 'Desabilitado';
    case 'unauthenticated':
      return 'Não autenticado';
    case 'warning':
      return 'Atenção';
    case 'error':
      return 'Problema';
    default:
      return 'Status';
  }
}
