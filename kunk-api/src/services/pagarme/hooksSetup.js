'use strict';

const crypto = require('crypto');
const client = require('./client');
const config = require('./config');
const credentialsService = require('../credentialsService');
const systemConfigService = require('../systemConfigService');
const { publicApiBase } = require('../../utils/publicApiUrl');
const { AppError } = require('../../utils/response');

const HOOK_EVENTS = ['order.paid', 'order.created'];
const SETUP_KEY = 'modules.pagarme.webhooks_setup';
const VALIDATED_KEY = 'modules.pagarme.webhooks_validated';
const RECEIPT_KEY = 'modules.pagarme.webhooks_validation_receipt';
const TEST_PAYMENT_KEY = 'modules.pagarme.webhook_test_payment';
const VALIDATION_ORDER_PREFIX = 'KUNK_WH_';
const DASHBOARD_HINT =
  'Obrigatório: no painel da Pagar.me o webhook precisa de autenticação HTTP Basic (usuário e senha iguais aos desta tela). Sem isso a API responde 401 e o pagamento não é confirmado. Conta → Configurações → Webhooks → Criar webhook; cole as URLs abaixo; ative HTTP Basic — não deixe o webhook anônimo. Eventos: order.created (obrigatório) e order.paid. Depois abra o link do passo 2, gere o boleto sem pagá-lo e clique em Validar (o order.created pode levar até 1 minuto).';

function webhookPaths() {
  return {
    orders: '/api/v1/modules/pagarme/webhook',
    services: '/api/v1/modules/pagarme/webhook-service',
  };
}

function isLocalPublicBase(base) {
  const b = String(base || '').toLowerCase();
  if (!b) return true;
  return (
    b.includes('localhost') ||
    b.includes('127.0.0.1') ||
    b.includes('[::1]') ||
    b.includes('0.0.0.0')
  );
}

/**
 * Base pública dos webhooks. Preferência:
 * PAGARME_WEBHOOK_PUBLIC_URL → PUBLIC_API_URL (se não-local).
 * Sem URL pública não há fallback de túnel — quem desenvolve configura o ambiente.
 */
function getWebhookPublicBase(req) {
  const fromWebhookEnv = String(process.env.PAGARME_WEBHOOK_PUBLIC_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromWebhookEnv) return fromWebhookEnv;

  const fromPublic = String(publicApiBase(req) || '')
    .trim()
    .replace(/\/$/, '');
  if (fromPublic && !isLocalPublicBase(fromPublic)) return fromPublic;

  return '';
}

function getWebhookUrls(req) {
  const base = getWebhookPublicBase(req);
  if (!base) {
    return { base: '', orders: '', services: '' };
  }
  const paths = webhookPaths();
  return {
    base,
    orders: `${base}${paths.orders}`,
    services: `${base}${paths.services}`,
  };
}

function stripUrlAuth(url) {
  try {
    const u = new URL(String(url || ''));
    u.username = '';
    u.password = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(url || '')
      .replace(/\/\/([^/@]+)@/, '//')
      .replace(/\/$/, '');
  }
}

function withBasicAuthInUrl(url, user, pass) {
  const uName = String(user || '').trim();
  const uPass = String(pass || '').trim();
  if (!uName && !uPass) return String(url || '');
  try {
    const u = new URL(String(url || ''));
    u.username = uName;
    u.password = uPass;
    return u.toString();
  } catch {
    return String(url || '');
  }
}

function urlsMatch(a, b) {
  return stripUrlAuth(a) === stripUrlAuth(b);
}

function extractHookList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function uniqBodies(events, url) {
  const bodies = [{ url, events: [...events] }];
  for (const event of events) {
    bodies.push({ url, event });
    bodies.push({ url, events: [event] });
  }
  const seen = new Set();
  return bodies.filter((b) => {
    const key = JSON.stringify(b);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function listHooks(query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return client.request(`/hooks${suffix}`);
}

async function getHook(hookId) {
  return client.request(`/hooks/${encodeURIComponent(hookId)}`);
}

async function retryHook(hookId) {
  return client.request(`/hooks/${encodeURIComponent(hookId)}/retry`, { method: 'POST' });
}

/**
 * Tenta registrar assinatura de webhook.
 * Docs oficiais cobrem list/get/retry; integrações usam POST /hooks com url+events.
 */
async function createHookSubscription(url, events = HOOK_EVENTS) {
  const attempts = uniqBodies(events, url);
  let lastErr = null;
  for (const body of attempts) {
    try {
      const response = await client.request('/hooks', { method: 'POST', body });
      return { ok: true, body_sent: body, response };
    } catch (err) {
      lastErr = err;
      if (err.code === 'PAGARME_AUTH') throw err;
    }
  }
  throw lastErr || new AppError(502, 'PAGARME_ERROR', 'Falha ao criar webhook na Pagar.me');
}

async function readStoredSetup() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    const raw = resolved.values?.[SETUP_KEY];
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function matchTargetsFromList(urls, listed) {
  const byTarget = {};
  for (const key of ['orders', 'services']) {
    const matches = listed.filter((h) => h?.url && urlsMatch(h.url, urls[key]));
    matches.sort((a, b) => String(b.last_attempt || b.created_at || '').localeCompare(String(a.last_attempt || a.created_at || '')));
    const last = matches[0] || null;
    const ok = matches.some(
      (m) =>
        String(m.status || '').toLowerCase() === 'sent' ||
        String(m.response_status || '') === '200'
    );
    byTarget[key] = {
      url: urls[key],
      deliveries_found: matches.length,
      last_status: last?.status || null,
      last_response_status: last?.response_status || null,
      last_attempt: last?.last_attempt || null,
      hook_id: last?.id || null,
      ok,
    };
  }
  return byTarget;
}

function summarizeStoredHooks(stored) {
  if (!stored || !Array.isArray(stored.results)) return [];
  const mode = stored.mode || 'dashboard';
  return stored.results.map((r) => ({
    key: r.key,
    label: r.key === 'orders' ? 'Pedidos' : r.key === 'services' ? 'Serviços' : r.key,
    url: r.url || stored.urls?.[r.key] || null,
    hook_id: r.hook_id || null,
    created: Boolean(r.created),
    mode: r.mode || mode,
    events: Array.isArray(r.events) ? r.events : stored.events || HOOK_EVENTS,
    error: r.created ? null : r.error || null,
    register_url_has_auth: Boolean(r.register_url_has_auth),
  }));
}

function friendlyListError(err) {
  const msg = err?.message || String(err || '');
  const status = err?.details?.status;
  const code = err?.code;
  if (status === 401 || code === 'PAGARME_AUTH' || /HTTP 401/i.test(msg)) {
    return { list_error: null, list_unavailable: true };
  }
  return { list_error: msg || null, list_unavailable: Boolean(msg) };
}

function isApiCreateUnsupported(err) {
  const status = err?.details?.status;
  const code = err?.code;
  return (
    code === 'PAGARME_AUTH' ||
    code === 'PAGARME_NOT_FOUND' ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    /HTTP 401/i.test(err?.message || '') ||
    /HTTP 403/i.test(err?.message || '') ||
    /HTTP 404/i.test(err?.message || '') ||
    /HTTP 405/i.test(err?.message || '')
  );
}

async function readValidated() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    const raw = resolved.values?.[VALIDATED_KEY];
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function clearWebhookValidation() {
  await config.setConfigValue(VALIDATED_KEY, '', 'Última validação webhooks Pagar.me', 'string');
}

async function readTestPayment() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    const raw = resolved.values?.[TEST_PAYMENT_KEY];
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function saveTestPayment(payload) {
  await config.setConfigValue(
    TEST_PAYMENT_KEY,
    JSON.stringify(payload),
    'Último link de pagamento de teste Pagar.me (setup Admin)',
    'string'
  );
}

function localWebhookUrls() {
  const port = Number(process.env.PORT || 4250);
  const base = `http://127.0.0.1:${port}`;
  const paths = webhookPaths();
  return {
    orders: `${base}${paths.orders}`,
    services: `${base}${paths.services}`,
  };
}

function classifyProbeFailure(res) {
  if (res?.error) {
    if (/abort|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(res.error)) {
      return 'rede: URL inacessível a partir da API (confira PUBLIC_API_URL / PAGARME_WEBHOOK_PUBLIC_URL)';
    }
    return res.error;
  }
  if (res?.ngrok_interstitial) {
    return 'túnel devolveu página de aviso (interstitial) em vez do JSON da API';
  }
  if (res?.http_status === 401) {
    return 'HTTP 401 — usuário/senha do webhook não conferem';
  }
  if (res?.http_status === 404) {
    return 'HTTP 404 — caminho não encontrado (túnel aponta para outro serviço?)';
  }
  if (res?.http_status != null && (res.http_status < 200 || res.http_status >= 300)) {
    return `HTTP ${res.http_status}`;
  }
  if (res?.not_json) {
    return 'resposta não-JSON (HTML/proxy) — o túnel não chegou na API';
  }
  return 'falha desconhecida';
}

async function probeWebhookEndpoint(url, user, pass, { label = 'public' } = {}) {
  const auth = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
  const body = {
    id: 'hook_kunk_validate',
    type: 'order.paid',
    data: { code: '__kunk_webhook_validate__', status: 'paid' },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        // ngrok free bloqueia requests sem este header (página HTML de browser warning)
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'kunk-api-webhook-validate/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    const text = await res.text().catch(() => '');
    const trimmed = String(text || '').trim();
    const looksHtml = /^<!doctype|<html/i.test(trimmed);
    const ngrokInterstitial = looksHtml || /ngrok|Visit Site|browser warning/i.test(trimmed);
    let parsed = null;
    if (!looksHtml && trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = null;
      }
    }
    // Aceita envelope { data, errors:null } mesmo se o pedido não existir.
    const ok =
      res.status >= 200 &&
      res.status < 300 &&
      parsed != null &&
      (parsed.errors == null || (Array.isArray(parsed.errors) && parsed.errors.length === 0));
    const detail = ok
      ? 'OK'
      : classifyProbeFailure({
          http_status: res.status,
          ngrok_interstitial: Boolean(ngrokInterstitial && !parsed),
          not_json: !parsed,
          error: parsed?.errors?.[0]?.message || null,
        });
    return {
      label,
      url,
      ok,
      http_status: res.status,
      not_json: !parsed,
      ngrok_interstitial: Boolean(ngrokInterstitial && !parsed),
      body_preview: trimmed.slice(0, 280),
      detail,
    };
  } catch (err) {
    const error = err.message || String(err);
    return {
      label,
      url,
      ok: false,
      http_status: null,
      error,
      detail: classifyProbeFailure({ error }),
      body_preview: null,
    };
  }
}

function assertWebhookAuth(creds) {
  const user = String(creds?.webhook_user || '').trim();
  const pass = String(creds?.webhook_pass || '').trim();
  if (!user || !pass) {
    throw new AppError(
      400,
      'WEBHOOK_AUTH_REQUIRED',
      'Usuário e senha do webhook são obrigatórios para validar'
    );
  }
  return { user, pass };
}

function buildValidationReason({ ready, basicAuthConfigured, probes, localProbes }) {
  if (ready) return null;
  if (!basicAuthConfigured) return 'Informe usuário e senha do webhook';
  if (!probes) return 'Clique em Validar webhooks para testar as URLs públicas';

  const parts = [];
  for (const key of ['orders', 'services']) {
    const pub = probes[key];
    const loc = localProbes?.[key];
    const name = key === 'orders' ? 'Pedidos' : 'Serviços';
    if (pub?.ok) {
      parts.push(`${name}: público OK`);
      continue;
    }
    let msg = `${name}: ${pub?.detail || 'falhou'}`;
    if (loc?.ok) msg += ' (local OK — problema na URL pública)';
    else if (loc && !loc.ok) msg += ` · local: ${loc.detail || 'falhou'}`;
    parts.push(msg);
  }
  return parts.join(' | ');
}

async function readValidationReceipt() {
  try {
    const resolved = await systemConfigService.resolveAll('modules');
    const raw = resolved.values?.[RECEIPT_KEY];
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Chamado nos handlers públicos: se o code/order for do teste KUNK_WH_*, grava recibo.
 * meta.auth_ok=false registra chegada com Basic Auth inválida (diagnóstico).
 */
async function captureValidationEvent(hook, meta = {}) {
  const { extractPaidPayload } = require('./webhook');
  const paid = extractPaidPayload(hook);
  let code = paid.code ? String(paid.code) : '';
  const orderId = paid.orderId ? String(paid.orderId) : null;

  if (!code.startsWith(VALIDATION_ORDER_PREFIX)) {
    const testPayment = await readTestPayment();
    if (testPayment?.order?.id && orderId && orderId === String(testPayment.order.id)) {
      code = String(testPayment.code || '');
    } else if (
      testPayment?.code &&
      String(hook?.data?.code || hook?.data?.order?.code || '') === String(testPayment.code)
    ) {
      code = String(testPayment.code);
    } else {
      return { captured: false };
    }
  }
  if (!code.startsWith(VALIDATION_ORDER_PREFIX)) {
    return { captured: false };
  }

  const receipt = {
    at: new Date().toISOString(),
    code,
    type: paid.type || hook?.type || null,
    order_id: orderId || null,
    data_status: hook?.data?.status || null,
    auth_ok: meta.auth_ok !== false,
  };
  const existing = await readValidationReceipt();
  if (
    existing?.code === code &&
    isOrderCreatedEvent(existing.type) &&
    existing.auth_ok !== false &&
    (!isOrderCreatedEvent(receipt.type) || receipt.auth_ok === false)
  ) {
    return { captured: true, receipt: existing, kept_created: true };
  }
  await config.setConfigValue(
    RECEIPT_KEY,
    JSON.stringify(receipt),
    'Recibo do último webhook de validação Pagar.me',
    'string'
  );
  return { captured: true, receipt };
}

async function clearValidationReceipt() {
  await config.setConfigValue(RECEIPT_KEY, '', 'Recibo do último webhook de validação Pagar.me', 'string');
}

function isOrderCreatedEvent(type) {
  return /^order\.create(?:d)?$/i.test(String(type || '').trim());
}

function receiptMatchesTestPayment(receipt, testPayment) {
  if (!receipt || !testPayment) return false;
  if (testPayment.code && receipt.code === testPayment.code) return true;
  if (testPayment.order?.id && receipt.order_id && receipt.order_id === testPayment.order.id) {
    return true;
  }
  return false;
}

/**
 * Cria Payment Link boleto na Pagar.me e ativa o módulo.
 * O passo 3 (webhooks) permanece opcional para validar a entrega dos eventos.
 */
async function createTestPaymentLink() {
  const { secretKey } = await client.resolveConfig();
  const isTestKey = /^sk_test_/i.test(String(secretKey || ''));
  const code = `${VALIDATION_ORDER_PREFIX}${Date.now()}`;
  const amount = 1500;
  const body = {
    type: 'order',
    name: 'Teste webhook Kunk',
    order_code: code,
    max_paid_sessions: 1,
    expires_in: 120,
    payment_settings: {
      accepted_payment_methods: ['boleto'],
      boleto_settings: {
        due_in: 5,
        instructions: 'Teste webhook Kunk — não pagar',
      },
    },
    cart_settings: {
      items: [
        {
          name: 'Teste validação webhook boleto Kunk',
          description: 'Gere o boleto para validar o webhook; não efetue o pagamento.',
          amount,
          default_quantity: 1,
        },
      ],
    },
  };

  await clearValidationReceipt();
  await clearWebhookValidation();

  const paymentLink = await client.request('/paymentlinks', {
    method: 'POST',
    body,
    apiBase: await client.paymentLinksApiBase(),
  });

  const payload = {
    at: new Date().toISOString(),
    code,
    is_test_key: isTestKey,
    method: 'payment_link_api',
    expected_events: ['order.created'],
    payment_url: paymentLink?.url || null,
    checkout_id: paymentLink?.id || null,
    order: {
      id: paymentLink?.id || null,
      code: paymentLink?.order_code || code,
      status: paymentLink?.status || null,
      charge_status: null,
    },
  };
  await saveTestPayment(payload);
  await enablePagarmeModule();
  return { ...payload, module_enabled: true };
}

/** @deprecated use createTestPaymentLink */
async function createWebhookTestOrder() {
  return createTestPaymentLink();
}

async function enablePagarmeModule() {
  await config.setConfigValue(
    'modules.pagarme.enabled',
    true,
    'Módulo pagarme ativado após link de pagamento de teste',
    'boolean'
  );
  await config.setConfigValue(
    'modules.pagarme.use_for_orders',
    true,
    'Pagar.me em pedidos (ativado com o módulo)',
    'boolean'
  );
  await config.setConfigValue(
    'modules.pagarme.use_for_services',
    true,
    'Pagar.me em serviços (ativado com o módulo)',
    'boolean'
  );
}

/**
 * Status (sem probe) ou validação ativa.
 * persist=true: probe endpoints + confere se o webhook do link de teste (passo 2) chegou.
 * Não cria novo boleto nem espera.
 */
async function validateWebhooks(req, { persist = false } = {}) {
  const urls = getWebhookUrls(req);
  const locals = localWebhookUrls();
  const creds = await credentialsService.resolveAll('pagarme');
  const user = String(creds.webhook_user || '').trim();
  const pass = String(creds.webhook_pass || '').trim();
  const basicAuthConfigured = Boolean(user && pass);
  const testPayment = await readTestPayment();

  if (persist) {
    assertWebhookAuth(creds);
    const probes = {
      orders: await probeWebhookEndpoint(urls.orders, user, pass, { label: 'public' }),
      services: await probeWebhookEndpoint(urls.services, user, pass, { label: 'public' }),
    };
    const localProbes = {
      orders: await probeWebhookEndpoint(locals.orders, user, pass, { label: 'local' }),
      services: await probeWebhookEndpoint(locals.services, user, pass, { label: 'local' }),
    };
    const endpointsOk = Boolean(probes.orders.ok && probes.services.ok);
    const receipt = await readValidationReceipt();
    const receiptForTest = receiptMatchesTestPayment(receipt, testPayment) ? receipt : null;
    const createdEventOk = Boolean(
      receiptForTest &&
        isOrderCreatedEvent(receiptForTest.type) &&
        receiptForTest.auth_ok !== false
    );

    let reason = null;
    if (!endpointsOk) {
      reason = buildValidationReason({
        ready: false,
        basicAuthConfigured: true,
        probes,
        localProbes,
      });
    } else if (!testPayment?.order?.id) {
      reason = 'Crie um link de pagamento de teste no passo 2 antes de validar os webhooks.';
    } else if (!receiptForTest) {
      reason =
        `Ainda não recebemos o webhook do link ${testPayment.order.id} (code ${testPayment.code}). ` +
        `A entrega na Pagar.me pode levar até 1 minuto — tente Validar de novo em breve. ` +
        `Confirme order.created na URL de Pedidos, com Basic Auth, e a URL pública da API.`;
    } else if (receiptForTest.auth_ok === false) {
      reason =
        `Webhook "${receiptForTest.type}" do code ${receiptForTest.code} chegou, ` +
        `mas com Basic Auth inválida. Use o mesmo usuário/senha do Admin no painel Pagar.me.`;
    } else if (!createdEventOk) {
      reason =
        `Chegou webhook "${receiptForTest.type}" para o code ${testPayment.code}, ` +
        `mas falta order.created. Cadastre order.created no painel.`;
    }

    const ready = Boolean(endpointsOk && createdEventOk);
    const at = new Date().toISOString();
    if (ready) {
      await enablePagarmeModule();
    }

    const payload = {
      at,
      ok: ready,
      urls: { orders: urls.orders, services: urls.services },
      local_urls: locals,
      auth_user: user,
      probes,
      local_probes: localProbes,
      test_order: testPayment,
      test_order_error: null,
      webhook_receipt: receiptForTest,
      reason,
      module_enabled: ready,
    };
    await config.setConfigValue(
      VALIDATED_KEY,
      JSON.stringify(payload),
      'Última validação webhooks Pagar.me',
      'string'
    );
    return {
      urls: payload.urls,
      local_urls: locals,
      events: HOOK_EVENTS,
      basic_auth_configured: true,
      basic_auth_user: user,
      dashboard_hint: DASHBOARD_HINT,
      ready,
      validated_at: at,
      probes,
      local_probes: localProbes,
      test_payment: testPayment,
      test_order: testPayment,
      test_order_error: null,
      webhook_receipt: receiptForTest,
      reason,
      module_enabled: ready,
      details: {
        public_ok: endpointsOk,
        local_ok: Boolean(localProbes.orders.ok && localProbes.services.ok),
        payment_link_created: Boolean(testPayment?.order?.id),
        boleto_created: Boolean(testPayment?.order?.id),
        order_created: Boolean(testPayment?.order?.id),
        webhook_received: Boolean(receiptForTest),
        order_created_event: createdEventOk,
      },
    };
  }

  const stored = await readValidated();
  let ready = false;
  let validatedAt = null;
  let probes = null;
  let localProbes = null;
  let reason = !basicAuthConfigured
    ? 'Informe usuário e senha do webhook'
    : !testPayment?.order?.id
      ? 'Crie um link de pagamento de teste (passo 2) e depois valide os webhooks'
      : 'Clique em Validar webhooks para conferir se a API já recebeu o order.created do link (pode levar até 1 minuto)';

  if (stored && basicAuthConfigured) {
    const urlsOk =
      urlsMatch(stored.urls?.orders, urls.orders) && urlsMatch(stored.urls?.services, urls.services);
    const userOk = !stored.auth_user || stored.auth_user === user;
    const testCodeOk =
      !stored.test_order?.code ||
      !testPayment?.code ||
      stored.test_order.code === testPayment.code;
    ready = Boolean(stored.ok) && urlsOk && userOk && testCodeOk;
    validatedAt = stored.at || null;
    probes = stored.probes || null;
    localProbes = stored.local_probes || null;
    if (!urlsOk) {
      reason = 'As URLs mudaram desde a última validação — valide de novo';
      ready = false;
    } else if (!userOk) {
      reason = 'O usuário do webhook mudou desde a última validação — valide de novo';
      ready = false;
    } else if (!testCodeOk) {
      reason = 'Foi criado um novo link de teste — valide os webhooks de novo';
      ready = false;
    } else {
      reason =
        stored.reason ||
        buildValidationReason({
          ready,
          basicAuthConfigured,
          probes,
          localProbes,
        });
    }
  }

  const storedReceipt = stored?.webhook_receipt || null;
  const liveReceipt = await readValidationReceipt();
  const webhookReceipt = receiptMatchesTestPayment(liveReceipt, testPayment)
    ? liveReceipt
    : storedReceipt;

  return {
    urls: { orders: urls.orders, services: urls.services },
    local_urls: locals,
    events: HOOK_EVENTS,
    basic_auth_configured: basicAuthConfigured,
    basic_auth_user: user || null,
    dashboard_hint: DASHBOARD_HINT,
    ready,
    validated_at: validatedAt,
    probes,
    local_probes: localProbes,
    test_payment: testPayment,
    test_order: testPayment || stored?.test_order || null,
    test_order_error: stored?.test_order_error || null,
    webhook_receipt: webhookReceipt,
    reason: ready ? null : reason,
    module_enabled: ready,
    details: probes
      ? {
          public_ok: Boolean(probes.orders?.ok && probes.services?.ok),
          local_ok: Boolean(localProbes?.orders?.ok && localProbes?.services?.ok),
          payment_link_created: Boolean(testPayment?.order?.id),
          boleto_created: Boolean(testPayment?.order?.id),
          order_created: Boolean(testPayment?.order?.id),
          webhook_received: Boolean(webhookReceipt?.code),
          order_created_event: Boolean(
            receiptMatchesTestPayment(webhookReceipt, testPayment) &&
              isOrderCreatedEvent(webhookReceipt?.type) &&
              webhookReceipt?.auth_ok !== false
          ),
        }
      : testPayment
        ? {
            public_ok: null,
            local_ok: null,
            payment_link_created: Boolean(testPayment?.order?.id),
            boleto_created: Boolean(testPayment?.order?.id),
            order_created: Boolean(testPayment?.order?.id),
            webhook_received: Boolean(
              receiptMatchesTestPayment(liveReceipt, testPayment) && liveReceipt
            ),
            order_created_event: Boolean(
              receiptMatchesTestPayment(liveReceipt, testPayment) &&
                isOrderCreatedEvent(liveReceipt?.type) &&
                liveReceipt?.auth_ok !== false
            ),
          }
        : null,
  };
}

async function ensureBasicAuthCredentials({ generateAuth = true } = {}) {
  await client.ensureCredentialRows();
  let creds = await credentialsService.resolveAll('pagarme');
  let authGenerated = false;
  if (
    generateAuth &&
    !String(creds.webhook_user || '').trim() &&
    !String(creds.webhook_pass || '').trim()
  ) {
    const user = `hook_${crypto.randomBytes(4).toString('hex')}`;
    const pass = crypto.randomBytes(18).toString('base64url');
    await credentialsService.putCredentials(
      'pagarme',
      { webhook_user: user, webhook_pass: pass },
      { runTest: false }
    );
    creds = await credentialsService.resolveAll('pagarme');
    authGenerated = true;
  }
  return { creds, authGenerated };
}

function preparedDashboardResults(urls) {
  return ['orders', 'services'].map((key) => ({
    key,
    url: urls[key],
    created: true,
    mode: 'dashboard',
    hook_id: null,
    events: HOOK_EVENTS,
    register_url_has_auth: false,
  }));
}

/**
 * Prepara receptores locais (URLs + Basic Auth).
 * A API pública v5 só documenta list/get/retry de entregas — cadastro de endpoint é no painel.
 * Tentamos POST /hooks; em 401/404/405 caímos no modo dashboard sem marcar falha.
 */
async function ensureWebhooks(req, { generateAuth = true } = {}) {
  await client.ensureCredentialRows();
  const urls = getWebhookUrls(req);
  if (!urls.base) {
    throw new AppError(
      400,
      'PUBLIC_API_URL_MISSING',
      'Defina PUBLIC_API_URL (não-local) ou PAGARME_WEBHOOK_PUBLIC_URL para a Pagar.me alcançar os webhooks'
    );
  }

  const resolved = await credentialsService.resolveAll('pagarme');
  if (!String(resolved.secret_key || '').trim()) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'secret_key Pagar.me ausente');
  }

  const { creds, authGenerated } = await ensureBasicAuthCredentials({ generateAuth });

  let mode = 'dashboard';
  let results = [];
  let apiProbeError = null;

  // Probe: um POST /hooks — conta/chave típica responde 401 (não há create oficial).
  try {
    const probe = await createHookSubscription(urls.orders, HOOK_EVENTS);
    const hookId =
      probe.response?.id ||
      probe.response?.data?.id ||
      (Array.isArray(probe.response?.data) ? probe.response.data[0]?.id : null) ||
      null;
    mode = 'api';
    results.push({
      key: 'orders',
      url: urls.orders,
      created: true,
      mode: 'api',
      hook_id: hookId,
      events: HOOK_EVENTS,
      register_url_has_auth: false,
      body_sent: probe.body_sent,
    });
    try {
      const second = await createHookSubscription(urls.services, HOOK_EVENTS);
      const sid =
        second.response?.id ||
        second.response?.data?.id ||
        (Array.isArray(second.response?.data) ? second.response.data[0]?.id : null) ||
        null;
      results.push({
        key: 'services',
        url: urls.services,
        created: true,
        mode: 'api',
        hook_id: sid,
        events: HOOK_EVENTS,
        register_url_has_auth: false,
        body_sent: second.body_sent,
      });
    } catch (err) {
      results.push({
        key: 'services',
        url: urls.services,
        created: false,
        mode: 'api',
        error: err.message || String(err),
        code: err.code || 'PAGARME_ERROR',
      });
    }
  } catch (err) {
    apiProbeError = {
      message: err.message || String(err),
      code: err.code || 'PAGARME_ERROR',
      status: err.details?.status || null,
    };
    if (!isApiCreateUnsupported(err)) {
      // Erro inesperado: ainda preparamos para o painel (fonte oficial de cadastro).
      apiProbeError.unexpected = true;
    }
    mode = 'dashboard';
    results = preparedDashboardResults(urls);
  }

  const setup = {
    at: new Date().toISOString(),
    mode,
    events: HOOK_EVENTS,
    urls: { orders: urls.orders, services: urls.services },
    auth_generated: authGenerated,
    basic_auth_configured: Boolean(
      String(creds.webhook_user || '').trim() || String(creds.webhook_pass || '').trim()
    ),
    dashboard_hint: mode === 'dashboard' ? DASHBOARD_HINT : null,
    api_probe_error: mode === 'dashboard' ? apiProbeError : null,
    results,
    ok: results.every((r) => r.created),
  };

  await config.setConfigValue(
    SETUP_KEY,
    JSON.stringify(setup),
    'Último setup de webhooks Pagar.me',
    'string'
  );

  const validation = await validateWebhooks(req);
  return {
    setup,
    validation,
    webhook_auth: {
      user: String(creds.webhook_user || '').trim() || null,
      // Só revela senha recém-gerada (não persistir no front).
      pass: authGenerated ? String(creds.webhook_pass || '') : null,
      generated: authGenerated,
    },
  };
}

async function getWebhooksStatus(req) {
  return validateWebhooks(req, { persist: false });
}

module.exports = {
  HOOK_EVENTS,
  SETUP_KEY,
  VALIDATED_KEY,
  isLocalPublicBase,
  getWebhookPublicBase,
  getWebhookUrls,
  stripUrlAuth,
  withBasicAuthInUrl,
  urlsMatch,
  extractHookList,
  summarizeStoredHooks,
  friendlyListError,
  isApiCreateUnsupported,
  DASHBOARD_HINT,
  listHooks,
  getHook,
  retryHook,
  createHookSubscription,
  ensureWebhooks,
  validateWebhooks,
  getWebhooksStatus,
  clearWebhookValidation,
  probeWebhookEndpoint,
  localWebhookUrls,
  buildValidationReason,
  captureValidationEvent,
  createTestPaymentLink,
  createWebhookTestOrder,
  readTestPayment,
  TEST_PAYMENT_KEY,
  VALIDATION_ORDER_PREFIX,
};
