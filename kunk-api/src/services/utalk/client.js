'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');

const DEFAULT_BASE_URL = 'https://app-utalk.umbler.com/api/v1';

async function resolveConfig(credsOverride = null) {
  const resolved = credsOverride
    ? {
        api_token: credsOverride.api_token,
        organization_id: credsOverride.organization_id,
        api_base_url: credsOverride.api_base_url,
        from_phone: credsOverride.from_phone,
      }
    : await credentialsService.resolveAll('utalk');

  const api_token = String(resolved.api_token || '').trim();
  const organization_id = String(resolved.organization_id || '').trim();
  const from_phone = String(resolved.from_phone || '').trim();
  const api_base_url = String(resolved.api_base_url || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/$/, '');

  return { api_token, organization_id, from_phone, api_base_url };
}

async function requireConfig(credsOverride = null) {
  const cfg = await resolveConfig(credsOverride);
  if (!cfg.api_token) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'api_token Utalk ausente');
  }
  if (!cfg.organization_id) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'organization_id Utalk ausente');
  }
  return cfg;
}

/** Exige telefone com DDI BR: +55… ou só dígitos 55…. Ex.: +5562999999999 / 5562999999999 */
function assertFromPhoneE164(phone) {
  const raw = String(phone || '').trim();
  if (!raw) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Informe o telefone do canal (from_phone) com código do país antes de autenticar'
    );
  }
  const digits = raw.startsWith('+') ? raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digits)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Telefone do canal inválido. Use DDI 55 + DDD + número, ex.: +5562999999999'
    );
  }
  return raw.startsWith('+') ? `+${digits}` : `+${digits}`;
}

/** Normaliza telefone BR para dígitos (API Utalk). Aceita +55… ou só dígitos. */
function normalizeToUtalkPhone(phone) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) {
    // Canal cadastrado como +55… — valida e remove o +
    if (/^\+55\d{10,11}$/.test(raw)) return raw.slice(1);
  }
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (digits.length < 12 || digits.length > 13) return null;
  if (!digits.startsWith('55')) return null;
  return digits;
}

async function sendSimplifiedMessage({ toPhone, message, contactName = null, skipReassign = false }, credsOverride = null) {
  const cfg = await requireConfig(credsOverride);
  assertFromPhoneE164(cfg.from_phone);
  const fromDigits = normalizeToUtalkPhone(cfg.from_phone);
  if (!fromDigits) {
    throw new AppError(400, 'CREDENTIAL_MISSING', 'from_phone Utalk ausente ou inválido');
  }
  const toDigits = normalizeToUtalkPhone(toPhone);
  if (!toDigits) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Telefone de destino inválido para Utalk');
  }
  const text = String(message || '').trim();
  if (!text) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Mensagem vazia');
  }
  // CreateMessageSimplifiedModel exige E.164 com '+' (ex.: +5511987654321).
  const body = {
    toPhone: `+${toDigits}`,
    fromPhone: `+${fromDigits}`,
    organizationId: cfg.organization_id,
    message: text,
    skipReassign: Boolean(skipReassign),
    contactName: contactName ? String(contactName).trim() : undefined,
  };
  return utalkFetch('/messages/simplified/', {
    method: 'POST',
    body,
    credsOverride,
  });
}

async function utalkFetch(path, { method = 'GET', body = null, credsOverride = null } = {}) {
  const cfg = await requireConfig(credsOverride);
  const url = path.startsWith('http') ? path : `${cfg.api_base_url}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = {
    Authorization: `Bearer ${cfg.api_token}`,
    Accept: 'application/json',
  };
  const init = { method, headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 400) };
    }
  }
  if (!res.ok) {
    throw new AppError(502, 'UTALK_ERROR', formatUtalkError(res.status, data, text), {
      status: res.status,
      path,
      remote: data,
    });
  }
  return data;
}

function formatUtalkError(status, data, text) {
  const title =
    (data && (data.title || data.message || data.error)) ||
    (text || '').slice(0, 200) ||
    'erro';
  const errors = data?.errors;
  if (errors && typeof errors === 'object') {
    const parts = [];
    for (const [key, val] of Object.entries(errors)) {
      const msg = Array.isArray(val) ? val.join('; ') : String(val);
      parts.push(`${key}: ${msg}`);
    }
    if (parts.length) return `Utalk HTTP ${status}: ${title} — ${parts.join(' | ')}`;
  }
  return `Utalk HTTP ${status}: ${title}`;
}

async function getChat(chatId, credsOverride = null) {
  const id = String(chatId || '').trim();
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'chatId é obrigatório');
  const cfg = await requireConfig(credsOverride);
  // Legado: /chats/{id}?organizationId=… (sem barra antes do query)
  return utalkFetch(
    `/chats/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(cfg.organization_id)}`,
    { credsOverride }
  );
}

async function transferChat(chatId, memberId, credsOverride = null) {
  const id = String(chatId || '').trim();
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'chatId é obrigatório');
  const cfg = await requireConfig(credsOverride);
  const mid =
    memberId == null || String(memberId).trim() === '' ? null : String(memberId).trim();
  // UpdateChatModel: só memberId (nullable). organizationId vai na query.
  const payload = { memberId: mid };
  return utalkFetch(
    `/chats/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(cfg.organization_id)}`,
    { method: 'PUT', body: payload, credsOverride }
  );
}

/**
 * Teste leve: GET /members/me/ (docs Umbler).
 * Valida o Bearer; se organization_id vier, confere se o membro pertence a essa org.
 */
async function testConnection(creds) {
  const cfg = await requireConfig(creds);
  assertFromPhoneE164(cfg.from_phone);
  const data = await utalkFetch('/members/me/', { credsOverride: cfg });

  const orgIds = collectOrganizationIds(data);
  if (cfg.organization_id && orgIds.length && !orgIds.includes(cfg.organization_id)) {
    throw new Error(
      `organization_id ${cfg.organization_id} não consta no retorno de /members/me (orgs: ${orgIds.join(', ')})`
    );
  }

  return {
    ok: true,
    member: data?.id || data?.memberId || null,
    organizations: orgIds.length || null,
    from_phone: cfg.from_phone,
  };
}

function collectOrganizationIds(data) {
  if (!data || typeof data !== 'object') return [];
  const ids = new Set();
  const push = (v) => {
    if (v == null || v === '') return;
    ids.add(String(v));
  };
  push(data.organizationId);
  push(data.organization_id);
  push(data.organization?.id);
  if (Array.isArray(data.organizations)) {
    for (const o of data.organizations) {
      push(o?.id);
      push(o?.organizationId);
      push(o?.organization_id);
    }
  }
  // Alguns payloads retornam lista de memberships
  if (Array.isArray(data)) {
    for (const item of data) {
      push(item?.id);
      push(item?.organizationId);
      push(item?.organization?.id);
    }
  }
  return [...ids];
}

async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('utalk', 'api_token', NULL, 'UTALK_API_TOKEN', true, 'Token de API Utalk (Bearer de qualquer usuário da org)'),
       ('utalk', 'organization_id', NULL, 'UTALK_ORG_ID', false, 'ID da organização Umbler Utalk'),
       ('utalk', 'from_phone', NULL, 'UTALK_FROM_PHONE', false, 'Telefone do canal no formato +55… (ex.: +5562999999999)'),
       ('utalk', 'api_base_url', NULL, 'UTALK_API_URL', false, 'Base URL da API Utalk')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  DEFAULT_BASE_URL,
  resolveConfig,
  requireConfig,
  assertFromPhoneE164,
  normalizeToUtalkPhone,
  getChat,
  transferChat,
  sendSimplifiedMessage,
  testConnection,
  ensureCredentialRows,
};
