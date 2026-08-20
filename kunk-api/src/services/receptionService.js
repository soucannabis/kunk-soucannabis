'use strict';

const { v4: uuidv4 } = require('uuid');
const itemsRepository = require('../repositories/itemsRepository');
const systemConfigService = require('./systemConfigService');
const activityService = require('./activityService');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

const STANDARD_FIELD_IDS = new Set([
  'name',
  'last_name',
  'email',
  'phone',
  'is_associate',
  'help_topic',
  'message',
  'patient_name',
]);

const DEFAULT_HELP_TOPIC_OPTIONS = [
  'Preciso de óleo / produto',
  'Renovação de receita',
  'Agendamento / consulta',
  'Dúvidas sobre cadastro',
  'Outro',
];

const DEFAULT_FORM_FIELDS = [
  { id: 'name', enabled: true, required: true, label: 'Nome', order: 1 },
  { id: 'last_name', enabled: true, required: true, label: 'Sobrenome', order: 2 },
  { id: 'email', enabled: true, required: true, label: 'E-mail', order: 3 },
  { id: 'phone', enabled: true, required: true, label: 'Telefone', order: 4 },
  {
    id: 'help_topic',
    enabled: true,
    required: true,
    label: 'Como podemos ajudar?',
    order: 5,
    type: 'select',
    options: [...DEFAULT_HELP_TOPIC_OPTIONS],
  },
  { id: 'message', enabled: true, required: true, label: 'Mensagem', order: 6 },
  { id: 'patient_name', enabled: false, required: true, label: 'Nome do paciente', order: 7 },
];

function normalizeSelectOption(o) {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return {
      label: String(o.label ?? o.value ?? '').trim(),
      enabled: o.enabled !== false,
    };
  }
  return { label: String(o ?? '').trim(), enabled: true };
}

function publicSelectOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map(normalizeSelectOption)
    .filter((o) => o.enabled && o.label)
    .map((o) => o.label);
}

function normalizeFormFields(fields) {
  const list = Array.isArray(fields) ? fields : [];
  return list
    .filter((f) => f && f.id !== 'is_associate' && f.id !== 'option2')
    .map((f) => {
      const field = f.id === 'option1' ? { ...f, id: 'help_topic' } : { ...f };
      if (field.id !== 'help_topic' && field.type !== 'select') return field;
      const raw = Array.isArray(field.options) && field.options.length
        ? field.options
        : (field.id === 'help_topic' ? DEFAULT_HELP_TOPIC_OPTIONS : []);
      const options = raw.map(normalizeSelectOption).filter((o) => o.label);
      return {
        ...field,
        type: 'select',
        options: options.length
          ? options
          : (field.id === 'help_topic'
            ? DEFAULT_HELP_TOPIC_OPTIONS.map((label) => ({ label, enabled: true }))
            : options),
      };
    });
}

const DEFAULT_STATUSES = [
  {
    id: 'waiting',
    value: 'waiting',
    label: 'Espera',
    order: 1,
    is_default_entry: true,
    is_terminal: false,
    system: true,
  },
  {
    id: 'done',
    value: 'done',
    label: 'Concluído',
    order: 99,
    is_default_entry: false,
    is_terminal: true,
    system: true,
  },
];

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function parseBool(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).toLowerCase().trim();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

function isValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function displayName(user) {
  const parts = [
    user.associate_name || user.name,
    user.associate_last_name || user.last_name,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  return user.fullname || user.email_account || null;
}

async function loadTriageConfig() {
  const { values } = await systemConfigService.resolveAll('triage');
  const themeRaw = String(values['triage.form.theme'] || '').trim().toLowerCase();
  const text = (key, fallback) => {
    const raw = String(values[key] ?? '').trim();
    return raw || fallback;
  };
  return {
    formFields: normalizeFormFields(parseJson(values['triage.form.fields'], DEFAULT_FORM_FIELDS)),
    customFields: parseJson(values['triage.form.custom_fields'], []),
    statuses: parseJson(values['triage.statuses'], DEFAULT_STATUSES),
    associateDocs: parseBool(values['triage.module.associate_docs'], false),
    publicFormEnabled: parseBool(values['triage.public_form_enabled'], true),
    formTheme: themeRaw === 'light' || themeRaw === 'claro' ? 'light' : 'dark',
    formTitle: text('triage.form.title', 'Fila de acolhimento'),
    formSubtitle: text('triage.form.subtitle', 'Preencha para entrar na fila de contato do acolhimento'),
    successTitle: text('triage.form.success_title', 'Você entrou na fila'),
    successSubtitle: text(
      'triage.form.success_subtitle',
      'Em breve a equipe de acolhimento entrará em contato.',
    ),
  };
}

function getEntryStatus(statuses) {
  const entry = (statuses || []).find((s) => s.is_default_entry);
  return entry?.value || 'waiting';
}

function getTerminalStatus(statuses) {
  const terminal = (statuses || []).find((s) => s.is_terminal);
  return terminal?.value || 'done';
}

/** Aceita value estável, label (legado) ou vazio → status de entrada (só create). */
function resolveReceptionStatus(raw, statuses, { fallbackToEntry = true } = {}) {
  const list = statuses || [];
  const entry = getEntryStatus(list);
  if (raw == null || raw === '') return fallbackToEntry ? entry : null;
  const s = String(raw).trim();
  if (!s) return fallbackToEntry ? entry : null;
  if (list.some((x) => x.value === s)) return s;
  const byLabel = list.find((x) => String(x.label || '').toLowerCase() === s.toLowerCase());
  if (byLabel?.value) return byLabel.value;
  return fallbackToEntry ? entry : null;
}

function enabledFields(cfg) {
  const standard = (cfg.formFields || [])
    .filter((f) => f && f.enabled !== false)
    .map((f) => ({ ...f, source: 'standard' }));
  const custom = (cfg.customFields || [])
    .filter((f) => f && f.enabled !== false)
    .map((f) => ({ ...f, source: 'custom' }));
  return [...standard, ...custom]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((f) => {
      if (f.type !== 'select' && f.id !== 'help_topic') return f;
      return { ...f, type: 'select', options: publicSelectOptions(f.options) };
    });
}

async function getFormSchema() {
  const cfg = await loadTriageConfig();
  return {
    enabled: cfg.publicFormEnabled,
    fields: enabledFields(cfg).map((f) => ({ ...f, required: true })),
    form_fields: cfg.formFields,
    custom_fields: cfg.customFields,
    statuses: cfg.statuses,
    associate_docs: cfg.associateDocs,
    theme: cfg.formTheme,
    title: cfg.formTitle,
    subtitle: cfg.formSubtitle,
    success_title: cfg.successTitle,
    success_subtitle: cfg.successSubtitle,
  };
}

async function findAssociateByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const result = await query(
    `SELECT id, user_code, associate_name, associate_last_name, fullname, email_account, avatar_url
     FROM users
     WHERE lower(email_account) = $1
       AND (status IS NULL OR status <> 'patient')
     ORDER BY id DESC
     LIMIT 1`,
    [normalized],
  );
  return result.rows[0] || null;
}

async function findAssociateByCode(associateCode) {
  const code = String(associateCode || '').trim();
  if (!code) return null;
  const result = await query(
    `SELECT id, user_code, associate_name, associate_last_name, fullname, email_account, avatar_url
     FROM users
     WHERE user_code::text = $1
     LIMIT 1`,
    [code],
  );
  return result.rows[0] || null;
}

function isEmptyValue(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function coerceFieldValue(field, raw) {
  if (field.type === 'checkbox' || field.id === 'is_associate') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase().trim();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === 'sim';
  }
  return raw == null ? '' : String(raw).trim();
}

async function createPublicReception(payload = {}) {
  const cfg = await loadTriageConfig();
  if (!cfg.publicFormEnabled) {
    throw new AppError(403, 'FORM_DISABLED', 'Formulário público de triagem desabilitado');
  }

  const fields = enabledFields(cfg);
  const body = payload || {};
  const standard = {};
  const customValues = {};
  const errors = [];

  for (const field of fields) {
    const raw = body[field.id];
    const value = coerceFieldValue(field, raw);
    if (isEmptyValue(value) && value !== false) {
      errors.push(`Campo obrigatório: ${field.label || field.id}`);
      continue;
    }
    if (field.id === 'email' && !isValidEmail(value)) {
      errors.push('Informe um e-mail válido');
      continue;
    }
    if (field.id === 'phone' && !isValidPhone(value)) {
      errors.push('Informe um telefone válido');
      continue;
    }
    if (field.source === 'custom') {
      if (!isEmptyValue(value) || value === false || value === true) {
        customValues[field.id] = value;
      }
    } else if (STANDARD_FIELD_IDS.has(field.id)) {
      standard[field.id] = value;
    }
  }

  if (errors.length) {
    throw new AppError(400, 'VALIDATION_ERROR', errors[0], { errors });
  }

  const email = normalizeEmail(standard.email);
  if (email) standard.email = email;

  let associateCode = null;
  let associateName = null;
  let avatarUrl = null;
  if (email) {
    const user = await findAssociateByEmail(email);
    if (user) {
      associateCode = user.user_code || null;
      associateName = displayName(user);
      avatarUrl = user.avatar_url || null;
      if (standard.is_associate === undefined || standard.is_associate === '') {
        standard.is_associate = true;
      }
    }
  }

  const entryStatus = getEntryStatus(cfg.statuses);
  const fullName = [standard.name, standard.last_name].filter(Boolean).join(' ').trim() || null;

  const tags = {
    labels: [],
    custom_fields: customValues,
  };

  const created = await itemsRepository.createItem('reception', {
    name: standard.name || null,
    last_name: standard.last_name || null,
    full_name: fullName,
    email: email || null,
    phone: standard.phone || null,
    help_topic: standard.help_topic || null,
    is_associate: Boolean(standard.is_associate),
    message: standard.message || null,
    patient_name: standard.patient_name || null,
    code: uuidv4(),
    status: entryStatus,
    associate_code: associateCode,
    associate_name: associateName,
    avatar_url: avatarUrl,
    tags,
    date_created: new Date().toISOString(),
  });

  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(created.id),
    entity_code: created.code || null,
    action: 'reception.created',
    actor_user_code: null,
    actor_name: 'Formulário público',
    summary: `Nova triagem criada: ${activityService.contactLabel(created)}`,
    metadata: {
      source: 'public',
      status: created.status,
      associate_code: created.associate_code || null,
    },
  });

  const utalkMsg = await require('./utalk/triageMessage').maybeSendTriageWelcome(created);
  if (utalkMsg?.ok && utalkMsg.chat_id) {
    let withChat = await itemsRepository.updateItem('reception', created.id, {
      chat_id: String(utalkMsg.chat_id).trim(),
      date_updated: new Date().toISOString(),
    });
    let syncMeta = null;
    try {
      const synced = await syncUtalk(withChat.id);
      withChat = synced.reception || withChat;
      syncMeta = synced.utalk || null;
    } catch (err) {
      syncMeta = {
        ok: false,
        code: err.code || 'UTALK_SYNC_ERROR',
        message: err.message || String(err),
      };
    }
    await activityService.recordSafe({
      entity_type: 'reception',
      entity_id: String(withChat.id),
      entity_code: withChat.code || null,
      action: 'reception.chat_linked',
      actor_user_code: null,
      actor_name: 'Formulário público',
      summary: `Chat Utalk vinculado automaticamente na triagem ${activityService.contactLabel(withChat)}`,
      metadata: {
        source: 'public_triage_message',
        chat_id: withChat.chat_id,
        attendant: withChat.attendant || null,
        utalk_message_id: utalkMsg.message_id || null,
        utalk_sync: syncMeta,
      },
    });
    return { ...withChat, utalk_message: utalkMsg, utalk_sync: syncMeta };
  }
  if (utalkMsg && !utalkMsg.skipped) {
    return { ...created, utalk_message: utalkMsg };
  }
  return created;
}

async function createReception(payload, actor = null) {
  const cfg = await loadTriageConfig();
  const status = resolveReceptionStatus(payload.status, cfg.statuses);
  const created = await itemsRepository.createItem('reception', {
    ...payload,
    code: payload.code || uuidv4(),
    date_created: new Date().toISOString(),
    status,
  });

  const actorFields = activityService.fromActor(actor);
  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(created.id),
    entity_code: created.code || null,
    action: 'reception.created',
    ...actorFields,
    summary: `${actorFields.actor_name} criou a triagem ${activityService.contactLabel(created)}`,
    metadata: {
      source: 'staff',
      status: created.status,
      associate_code: created.associate_code || null,
    },
  });

  return created;
}

async function complete(id, completionReason, actor = null) {
  if (!completionReason) {
    throw new AppError(400, 'VALIDATION_ERROR', 'completion_reason é obrigatório');
  }
  const before = await itemsRepository.getItem('reception', id);
  const cfg = await loadTriageConfig();
  const updated = await itemsRepository.updateItem('reception', id, {
    completion_reason: completionReason,
    status: getTerminalStatus(cfg.statuses),
    date_updated: new Date().toISOString(),
  });

  const actorFields = activityService.fromActor(actor);
  const relatedCode = before.attendant || null;
  const relatedName = relatedCode ? await activityService.resolveAttendantName(relatedCode) : null;
  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(updated.id),
    entity_code: updated.code || null,
    action: 'reception.completed',
    ...actorFields,
    ...activityService.relatedFrom({
      code: relatedCode && relatedCode !== actorFields.actor_user_code ? relatedCode : null,
      name: relatedCode && relatedCode !== actorFields.actor_user_code ? relatedName : null,
    }),
    summary: `${actorFields.actor_name} concluiu a triagem ${activityService.contactLabel(updated)} → ${completionReason}`,
    metadata: {
      completion_reason: completionReason,
      status_from: before.status || null,
      status_to: updated.status,
      associate_code: updated.associate_code || null,
      associate_name: updated.associate_name || null,
    },
  });

  return updated;
}

async function assignAttendant(id, attendant, actor = null) {
  // null / '' clears the attendant (legacy “remover”)
  if (attendant === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'attendant é obrigatório');
  }
  const value = attendant === null || attendant === '' ? null : String(attendant).trim();
  if (value === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'attendant inválido');
  }

  const before = await itemsRepository.getItem('reception', id);
  const updated = await itemsRepository.updateItem('reception', id, {
    attendant: value,
    date_updated: new Date().toISOString(),
  });

  const actorFields = activityService.fromActor(actor);
  const actorCode = actorFields.actor_user_code;
  const contact = activityService.contactLabel(updated);
  const associateHint = updated.associate_name
    ? ` (associado ${updated.associate_name})`
    : '';

  if (value == null) {
    const previous = before.attendant || null;
    const previousName = previous ? await activityService.resolveAttendantName(previous) : null;
    await activityService.recordSafe({
      entity_type: 'reception',
      entity_id: String(updated.id),
      entity_code: updated.code || null,
      action: 'reception.attendant_cleared',
      ...actorFields,
      ...activityService.relatedFrom({
        code: previous && previous !== actorCode ? previous : null,
        name: previous && previous !== actorCode ? previousName : null,
      }),
      summary: `${actorFields.actor_name} removeu o atendente da triagem ${contact}`,
      metadata: {
        previous_attendant: previous,
        associate_code: updated.associate_code || null,
      },
    });
  } else if (actorCode && value === actorCode) {
    await activityService.recordSafe({
      entity_type: 'reception',
      entity_id: String(updated.id),
      entity_code: updated.code || null,
      action: 'reception.assumed',
      ...actorFields,
      related_user_code: null,
      related_user_name: null,
      summary: `${actorFields.actor_name} assumiu a triagem ${contact}${associateHint}`,
      metadata: {
        attendant: value,
        previous_attendant: before.attendant || null,
        associate_code: updated.associate_code || null,
        associate_name: updated.associate_name || null,
      },
    });
  } else {
    const targetName = await activityService.resolveAttendantName(value);
    await activityService.recordSafe({
      entity_type: 'reception',
      entity_id: String(updated.id),
      entity_code: updated.code || null,
      action: 'reception.transferred',
      ...actorFields,
      ...activityService.relatedFrom({ code: value, name: targetName }),
      summary: `${actorFields.actor_name} transferiu o contato ${contact} para ${targetName}`,
      metadata: {
        attendant: value,
        previous_attendant: before.attendant || null,
        associate_code: updated.associate_code || null,
      },
    });
  }

  const rowForUtalk = {
    ...updated,
    chat_id: updated.chat_id || before.chat_id || null,
  };
  const utalk = await maybeTransferUtalk(rowForUtalk, value);
  return utalk ? { ...updated, chat_id: rowForUtalk.chat_id, utalk } : updated;
}

/**
 * Fail-soft: se módulo Utalk ativo e há chat_id, transfere no Umbler.
 * Não reverte o assign local se o Utalk falhar.
 */
async function maybeTransferUtalk(receptionRow, attendantCode) {
  const chatId = String(receptionRow?.chat_id || '').trim();
  if (!chatId) return null;
  try {
    const { isModuleEnabled } = require('./moduleFlags');
    if (!(await isModuleEnabled('utalk'))) return null;
    const utalkClient = require('./utalk/client');
    const { resolveUtalkIdByCode } = require('./utalk/attendants');
    let memberId = null;
    if (attendantCode) {
      memberId = await resolveUtalkIdByCode(attendantCode);
      memberId = memberId ? String(memberId).trim() : null;
      if (!memberId) {
        return {
          ok: false,
          skipped: true,
          code: 'UTALK_ID_MISSING',
          message: `Operador sem utalk_id cadastrado — configure em Admin → Serviços externos → Utalk`,
        };
      }
    }
    await utalkClient.transferChat(chatId, memberId);
    return { ok: true, chat_id: chatId, member_id: memberId };
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'UTALK_ERROR',
      message: err.message || String(err),
      details: err.details || null,
    };
  }
}

async function setChatId(id, chatId, actor = null) {
  const value =
    chatId == null || String(chatId).trim() === '' ? null : String(chatId).trim();
  const before = await itemsRepository.getItem('reception', id);
  let updated = await itemsRepository.updateItem('reception', id, {
    chat_id: value,
    date_updated: new Date().toISOString(),
  });
  let syncMeta = null;
  if (value) {
    try {
      const synced = await syncUtalk(updated.id);
      updated = synced.reception || updated;
      syncMeta = synced.utalk || null;
    } catch (err) {
      syncMeta = {
        ok: false,
        code: err.code || 'UTALK_SYNC_ERROR',
        message: err.message || String(err),
      };
    }
  }
  const actorFields = activityService.fromActor(actor);
  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(updated.id),
    entity_code: updated.code || null,
    action: value ? 'reception.chat_linked' : 'reception.chat_unlinked',
    ...actorFields,
    summary: value
      ? `${actorFields.actor_name} vinculou chat Utalk na triagem ${activityService.contactLabel(updated)}`
      : `${actorFields.actor_name} removeu chat Utalk da triagem ${activityService.contactLabel(updated)}`,
    metadata: {
      chat_id: value,
      previous_chat_id: before.chat_id || null,
      attendant: updated.attendant || null,
      utalk_sync: syncMeta,
    },
  });
  return syncMeta ? { ...updated, utalk_sync: syncMeta } : updated;
}

/**
 * Sync attendant from Utalk chat organizationMember → system_users.utalk_id.
 */
async function syncUtalk(id) {
  const { isModuleEnabled } = require('./moduleFlags');
  if (!(await isModuleEnabled('utalk'))) {
    throw new AppError(503, 'MODULE_DISABLED', 'Módulo utalk não está ativo');
  }
  const row = await itemsRepository.getItem('reception', id);
  if (!row?.chat_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Contato sem chat_id Utalk');
  }
  const utalkClient = require('./utalk/client');
  const chat = await utalkClient.getChat(row.chat_id);
  const memberId = chat?.organizationMember?.id || chat?.organization_member?.id || null;

  if (!memberId) {
    if (row.attendant) {
      const updated = await itemsRepository.updateItem('reception', id, {
        attendant: null,
        date_updated: new Date().toISOString(),
      });
      return {
        reception: updated,
        utalk: { ok: true, cleared: true, member_id: null },
      };
    }
    return {
      reception: row,
      utalk: { ok: true, updated: false, cleared: false, member_id: null },
    };
  }

  const result = await query(
    `SELECT user_code, internal_code FROM system_users
     WHERE utalk_id::text = $1
     LIMIT 1`,
    [String(memberId)]
  );
  const match = result.rows[0];
  if (!match) {
    return {
      reception: row,
      utalk: {
        ok: true,
        updated: false,
        unknown_member: true,
        member_id: String(memberId),
      },
    };
  }
  const code = match.user_code || match.internal_code;
  if (row.attendant === code) {
    return {
      reception: row,
      utalk: { ok: true, updated: false, attendant: code, member_id: String(memberId) },
    };
  }
  const updated = await itemsRepository.updateItem('reception', id, {
    attendant: code,
    date_updated: new Date().toISOString(),
  });
  return {
    reception: updated,
    utalk: { ok: true, updated: true, attendant: code, member_id: String(memberId) },
  };
}

async function syncUtalkWaiting({ concurrency = 5 } = {}) {
  const { isModuleEnabled } = require('./moduleFlags');
  if (!(await isModuleEnabled('utalk'))) {
    throw new AppError(503, 'MODULE_DISABLED', 'Módulo utalk não está ativo');
  }
  const cfg = await loadTriageConfig();
  const entry = getEntryStatus(cfg.statuses);
  const list = await query(
    `SELECT id, chat_id, attendant, status FROM reception
     WHERE status = $1 AND chat_id IS NOT NULL AND trim(chat_id) <> ''
     ORDER BY date_created ASC NULLS LAST
     LIMIT 200`,
    [entry]
  );
  const rows = list.rows;
  const results = [];
  let i = 0;
  const limit = Math.max(1, Math.min(10, Number(concurrency) || 5));

  async function worker() {
    while (i < rows.length) {
      const idx = i++;
      const row = rows[idx];
      try {
        const synced = await syncUtalk(row.id);
        results.push({
          id: row.id,
          ok: true,
          updated: Boolean(synced.utalk?.updated),
          cleared: Boolean(synced.utalk?.cleared),
          unknown_member: Boolean(synced.utalk?.unknown_member),
        });
      } catch (err) {
        results.push({
          id: row.id,
          ok: false,
          message: err.message || String(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, rows.length || 1) }, () => worker()));
  return {
    total: rows.length,
    updated: results.filter((r) => r.updated).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

const TRIAGE_ATTENDANT_ROLES = ['Administrador', 'Acolhimento', 'Produção'];

function parsePermissions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* ignore */
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function attendantCode(row) {
  return row.user_code || row.internal_code || (row.id != null ? String(row.id) : null);
}

/** Operators who can take triage contacts (no secrets). */
async function listAttendants() {
  const { getOrSet, cacheTtl, keys } = require('../cache');
  return getOrSet(keys.ATTENDANTS, cacheTtl.KUNK_USERS_MS, async () => {
    const result = await query(
      `SELECT id, name, last_name, email, user_code, internal_code, avatar_url, permissions, status, utalk_id
       FROM system_users
       WHERE status IS NULL OR lower(status) <> 'inactive'
       ORDER BY name ASC NULLS LAST, last_name ASC NULLS LAST
       LIMIT 200`,
    );
    return result.rows
      .map((row) => {
        const permissions = parsePermissions(row.permissions);
        const code = attendantCode(row);
        return {
          id: row.id,
          code,
          user_code: row.user_code || null,
          internal_code: row.internal_code || null,
          name: row.name || '',
          last_name: row.last_name || '',
          email: row.email || null,
          avatar_url: row.avatar_url || null,
          permissions,
          utalk_id: row.utalk_id || null,
        };
      })
      .filter((u) => {
        if (!u.code) return false;
        return u.permissions.some((p) => TRIAGE_ATTENDANT_ROLES.includes(p));
      });
  });
}

async function updateStatus(id, status, actor = null) {
  const raw = String(status || '').trim();
  if (!raw) throw new AppError(400, 'VALIDATION_ERROR', 'status é obrigatório');
  const cfg = await loadTriageConfig();
  const value = resolveReceptionStatus(raw, cfg.statuses, { fallbackToEntry: false });
  const allowed = new Set((cfg.statuses || []).map((s) => s.value));
  if (!value || !allowed.has(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Status inválido: ${raw}`);
  }
  const before = await itemsRepository.getItem('reception', id);
  const updated = await itemsRepository.updateItem('reception', id, {
    status: value,
    date_updated: new Date().toISOString(),
  });

  const actorFields = activityService.fromActor(actor);
  const toLabel = (cfg.statuses || []).find((s) => s.value === value)?.label || value;
  const fromLabel = (cfg.statuses || []).find((s) => s.value === before.status)?.label || before.status || '—';
  const relatedCode = before.attendant || null;
  const relatedName = relatedCode ? await activityService.resolveAttendantName(relatedCode) : null;

  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(updated.id),
    entity_code: updated.code || null,
    action: 'reception.status_changed',
    ...actorFields,
    ...activityService.relatedFrom({
      code: relatedCode && relatedCode !== actorFields.actor_user_code ? relatedCode : null,
      name: relatedCode && relatedCode !== actorFields.actor_user_code ? relatedName : null,
    }),
    summary: `${actorFields.actor_name} mudou o status de ${activityService.contactLabel(updated)} para ${toLabel}`,
    metadata: {
      status_from: before.status || null,
      status_to: value,
      status_from_label: fromLabel,
      status_to_label: toLabel,
    },
  });

  return updated;
}

async function linkAssociate(id, associateCode, actor = null) {
  const code = String(associateCode || '').trim();
  if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'associate_code é obrigatório');
  const user = await findAssociateByCode(code);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Associado não encontrado');
  const updated = await itemsRepository.updateItem('reception', id, {
    associate_code: user.user_code,
    associate_name: displayName(user),
    avatar_url: user.avatar_url || null,
    is_associate: true,
    date_updated: new Date().toISOString(),
  });

  const actorFields = activityService.fromActor(actor);
  const assocName = displayName(user);
  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(updated.id),
    entity_code: updated.code || null,
    action: 'reception.linked',
    ...actorFields,
    related_user_code: updated.attendant && updated.attendant !== actorFields.actor_user_code
      ? updated.attendant
      : null,
    related_user_name: updated.attendant && updated.attendant !== actorFields.actor_user_code
      ? await activityService.resolveAttendantName(updated.attendant)
      : null,
    summary: `${actorFields.actor_name} linkou o associado ${assocName} na triagem ${activityService.contactLabel(updated)}`,
    metadata: {
      associate_code: user.user_code,
      associate_name: assocName,
    },
  });

  return updated;
}

async function unlinkAssociate(id, actor = null) {
  const before = await itemsRepository.getItem('reception', id);
  const updated = await itemsRepository.updateItem('reception', id, {
    associate_code: null,
    associate_name: null,
    date_updated: new Date().toISOString(),
  });

  const actorFields = activityService.fromActor(actor);
  await activityService.recordSafe({
    entity_type: 'reception',
    entity_id: String(updated.id),
    entity_code: updated.code || null,
    action: 'reception.unlinked',
    ...actorFields,
    related_user_code: before.attendant && before.attendant !== actorFields.actor_user_code
      ? before.attendant
      : null,
    related_user_name: before.attendant && before.attendant !== actorFields.actor_user_code
      ? await activityService.resolveAttendantName(before.attendant)
      : null,
    summary: `${actorFields.actor_name} desvinculou o associado da triagem ${activityService.contactLabel(before)}`,
    metadata: {
      previous_associate_code: before.associate_code || null,
      previous_associate_name: before.associate_name || null,
    },
  });

  return updated;
}

async function statusCounts() {
  const result = await query(
    `SELECT COALESCE(status, '') AS status, COUNT(*)::int AS count
     FROM reception
     GROUP BY COALESCE(status, '')`,
  );
  const counts = {};
  for (const row of result.rows) {
    counts[row.status || ''] = row.count;
  }
  return counts;
}

async function completeOpenByAssociate({ email, associate_code, completion_reason, actor = null }) {
  if (!completion_reason) {
    throw new AppError(400, 'VALIDATION_ERROR', 'completion_reason é obrigatório');
  }
  const cfg = await loadTriageConfig();
  const terminal = getTerminalStatus(cfg.statuses);
  const normalized = normalizeEmail(email);
  const code = associate_code ? String(associate_code).trim() : null;

  if (!normalized && !code) {
    return { updated: 0, ids: [] };
  }

  const clauses = [];
  const params = [];
  if (normalized) {
    params.push(normalized);
    clauses.push(`lower(email) = $${params.length}`);
  }
  if (code) {
    params.push(code);
    clauses.push(`associate_code::text = $${params.length}`);
  }
  params.push(terminal);

  const result = await query(
    `UPDATE reception
     SET status = $${params.length},
         completion_reason = $${params.length + 1},
         date_updated = NOW()
     WHERE status IS DISTINCT FROM $${params.length}
       AND (${clauses.join(' OR ')})
     RETURNING *`,
    [...params, completion_reason],
  );

  const actorFields = activityService.fromActor(actor);
  for (const row of result.rows) {
    try {
      const { emitWebhookSafe } = require('./webhooks/emit');
      // UPDATE só altera status / completion_reason / date_updated
      emitWebhookSafe({
        table: 'reception',
        action: 'update',
        recordId: row.id,
        data: {
          id: row.id,
          status: row.status,
          completion_reason: row.completion_reason,
          date_updated: row.date_updated,
        },
      });
    } catch {
      /* fail-soft */
    }
    await activityService.recordSafe({
      entity_type: 'reception',
      entity_id: String(row.id),
      entity_code: row.code || null,
      action: 'reception.completed',
      ...actorFields,
      related_user_code: row.attendant && row.attendant !== actorFields.actor_user_code
        ? row.attendant
        : null,
      related_user_name: row.attendant && row.attendant !== actorFields.actor_user_code
        ? await activityService.resolveAttendantName(row.attendant)
        : null,
      summary: `${actorFields.actor_name} concluiu a triagem ${activityService.contactLabel(row)} → ${completion_reason}`,
      metadata: {
        completion_reason,
        source: 'completeOpenByAssociate',
        status_to: terminal,
        associate_code: row.associate_code || null,
      },
    });
  }

  return { updated: result.rows.length, ids: result.rows.map((r) => r.id) };
}

module.exports = {
  createReception,
  createPublicReception,
  getFormSchema,
  complete,
  assignAttendant,
  setChatId,
  syncUtalk,
  syncUtalkWaiting,
  updateStatus,
  linkAssociate,
  unlinkAssociate,
  statusCounts,
  completeOpenByAssociate,
  loadTriageConfig,
  listAttendants,
};
