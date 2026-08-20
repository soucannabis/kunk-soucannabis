'use strict';

const { query } = require('../../db/pool');
const { isModuleEnabled, asBool } = require('../moduleFlags');
const utalkClient = require('./client');

const TRIAGE_MSG_ENABLED_KEY = 'modules.utalk.triage_message_enabled';
const TRIAGE_MSG_KEY = 'modules.utalk.triage_message';
const DEFAULT_TRIAGE_MESSAGE =
  'Olá {{nome}}, recebemos seu contato. Em breve um atendente falará com você.';

async function getTriageMessageConfig() {
  const result = await query(
    `SELECT key, value FROM system_configs
     WHERE system = 'modules' AND key = ANY($1::text[])`,
    [[TRIAGE_MSG_ENABLED_KEY, TRIAGE_MSG_KEY]]
  );
  const values = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  const stored =
    values[TRIAGE_MSG_KEY] != null && String(values[TRIAGE_MSG_KEY]).trim() !== ''
      ? String(values[TRIAGE_MSG_KEY])
      : DEFAULT_TRIAGE_MESSAGE;
  return {
    triage_message_enabled: asBool(values[TRIAGE_MSG_ENABLED_KEY], false),
    triage_message: stored,
  };
}

function renderTriageMessage(template, reception) {
  const name = [reception?.name, reception?.last_name].filter(Boolean).join(' ').trim()
    || reception?.full_name
    || reception?.associate_name
    || '';
  const phone = reception?.phone || '';
  return String(template || '')
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*nome\s*\}\}/gi, name)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*telefone\s*\}\}/gi, phone)
    .trim();
}

/**
 * Envia mensagem de triagem via Utalk após criar reception (fail-soft).
 * Requer módulo utalk ativo + flag triage_message_enabled + telefone + texto.
 */
async function maybeSendTriageWelcome(reception) {
  try {
    if (!(await isModuleEnabled('utalk'))) {
      return { ok: false, skipped: true, code: 'MODULE_DISABLED' };
    }
    const cfg = await getTriageMessageConfig();
    if (!cfg.triage_message_enabled) {
      return { ok: false, skipped: true, code: 'TRIAGE_MESSAGE_DISABLED' };
    }
    const message = renderTriageMessage(cfg.triage_message, reception);
    if (!message) {
      return { ok: false, skipped: true, code: 'TRIAGE_MESSAGE_EMPTY' };
    }
    const phone = reception?.phone;
    if (!phone) {
      return { ok: false, skipped: true, code: 'PHONE_MISSING' };
    }
    const contactName = [reception?.name, reception?.last_name].filter(Boolean).join(' ').trim()
      || reception?.full_name
      || null;
    const result = await utalkClient.sendSimplifiedMessage({
      toPhone: phone,
      message,
      contactName,
    });
    // SentMessageModel: chat é ChatIdReferenceModel — não usar result.id (id da mensagem).
    const chatId = extractChatId(result);
    return { ok: true, chat_id: chatId, message_id: result?.id || null };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'UTALK_ERROR',
      message: err.message || String(err),
    };
  }
}

/** Extrai chat.id da resposta de POST /messages/simplified (SentMessageModel). */
function extractChatId(result) {
  const raw = result?.chat?.id ?? result?.chatId ?? null;
  if (raw == null) return null;
  const id = String(raw).trim();
  return id || null;
}

module.exports = {
  TRIAGE_MSG_ENABLED_KEY,
  TRIAGE_MSG_KEY,
  DEFAULT_TRIAGE_MESSAGE,
  getTriageMessageConfig,
  renderTriageMessage,
  extractChatId,
  maybeSendTriageWelcome,
};
