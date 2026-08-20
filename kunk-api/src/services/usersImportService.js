'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { parseCsvText } = require('../utils/csv');
const itemsRepository = require('../repositories/itemsRepository');
const { PHASE } = require('../constants/associatePhases');

/** Campos importáveis de `users` com label em português (não exibir inglês na UI). */
const IMPORT_FIELDS = [
  { key: 'associate_name', label: 'Nome', type: 'text', requiredHint: true },
  { key: 'associate_last_name', label: 'Sobrenome', type: 'text', requiredHint: true },
  { key: 'fullname', label: 'Nome completo', type: 'text' },
  { key: 'email_account', label: 'E-mail', type: 'email', requiredHint: true },
  { key: 'associate_cpf', label: 'CPF', type: 'cpf' },
  { key: 'mobile_number', label: 'Celular', type: 'phone' },
  { key: 'associate_birth_date', label: 'Data de nascimento', type: 'date' },
  { key: 'created_date', label: 'Data de criação', type: 'datetime' },
  { key: 'gender', label: 'Gênero', type: 'text' },
  { key: 'nationality', label: 'Nacionalidade', type: 'text' },
  { key: 'marital_status', label: 'Estado civil', type: 'text' },
  { key: 'associate_rg', label: 'RG', type: 'text' },
  { key: 'associate_rg_issuer', label: 'Órgão emissor do RG', type: 'text' },
  { key: 'responsible_type', label: 'Tipo de cadastro', type: 'responsible_type' },
  { key: 'street', label: 'Rua', type: 'text' },
  { key: 'street_number', label: 'Número', type: 'text' },
  { key: 'complement', label: 'Complemento', type: 'text' },
  { key: 'neighborhood', label: 'Bairro', type: 'text' },
  { key: 'city', label: 'Cidade', type: 'text' },
  { key: 'state', label: 'UF', type: 'state' },
  { key: 'cep', label: 'CEP', type: 'cep' },
  { key: 'reason_treatment_text', label: 'Motivo do tratamento', type: 'text' },
  { key: 'prescriber', label: 'Prescritor', type: 'text' },
];

const FIELD_BY_KEY = new Map(IMPORT_FIELDS.map((f) => [f.key, f]));

/** Aliases comuns (CSV header normalizado) → chave do banco. */
const HEADER_ALIASES = {
  nome: 'associate_name',
  name: 'associate_name',
  'nome do associado': 'associate_name',
  associate_name: 'associate_name',
  sobrenome: 'associate_last_name',
  'last name': 'associate_last_name',
  last_name: 'associate_last_name',
  'sobrenome do associado': 'associate_last_name',
  associate_last_name: 'associate_last_name',
  'nome completo': 'fullname',
  fullname: 'fullname',
  email: 'email_account',
  'e-mail': 'email_account',
  'e-mail da conta': 'email_account',
  email_account: 'email_account',
  'email da conta': 'email_account',
  cpf: 'associate_cpf',
  'cpf do associado': 'associate_cpf',
  associate_cpf: 'associate_cpf',
  celular: 'mobile_number',
  telefone: 'mobile_number',
  phone: 'mobile_number',
  mobile: 'mobile_number',
  mobile_number: 'mobile_number',
  nascimento: 'associate_birth_date',
  'data de nascimento': 'associate_birth_date',
  birth_date: 'associate_birth_date',
  associate_birth_date: 'associate_birth_date',
  genero: 'gender',
  gênero: 'gender',
  gender: 'gender',
  nacionalidade: 'nationality',
  nationality: 'nationality',
  'estado civil': 'marital_status',
  marital_status: 'marital_status',
  rg: 'associate_rg',
  associate_rg: 'associate_rg',
  'orgao emissor': 'associate_rg_issuer',
  'órgão emissor': 'associate_rg_issuer',
  'órgão emissor do rg': 'associate_rg_issuer',
  associate_rg_issuer: 'associate_rg_issuer',
  'tipo de cadastro': 'responsible_type',
  'tipo de responsavel': 'responsible_type',
  'tipo de responsável': 'responsible_type',
  responsible_type: 'responsible_type',
  rua: 'street',
  street: 'street',
  endereco: 'street',
  endereço: 'street',
  numero: 'street_number',
  número: 'street_number',
  street_number: 'street_number',
  complemento: 'complement',
  complement: 'complement',
  bairro: 'neighborhood',
  neighborhood: 'neighborhood',
  cidade: 'city',
  city: 'city',
  uf: 'state',
  estado: 'state',
  state: 'state',
  cep: 'cep',
  'motivo do tratamento': 'reason_treatment_text',
  reason_treatment_text: 'reason_treatment_text',
  prescritor: 'prescriber',
  prescriber: 'prescriber',
  'data de criacao': 'created_date',
  'data de criação': 'created_date',
  created_date: 'created_date',
  'created date': 'created_date',
};

const RESPONSIBLE_TYPE_ALIASES = {
  himself: 'himself',
  titular: 'himself',
  proprio: 'himself',
  próprio: 'himself',
  'para mim': 'himself',
  another: 'another',
  responsavel: 'another',
  responsável: 'another',
  paciente: 'another',
  third: 'another',
  pet: 'pet',
  animal: 'pet',
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function isValidCep(value) {
  return onlyDigits(value).length === 8;
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

/**
 * Normaliza telefone BR para E.164 com +55 (ex.: +5562999999999).
 * Se não tiver DDI 55, prefixa +55.
 */
function formatPhoneBr(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  let digits = onlyDigits(raw);
  if (!digits) return '';

  if (raw.startsWith('+55')) {
    digits = onlyDigits(raw.slice(1));
  } else if (digits.startsWith('55') && digits.length >= 12) {
    // já tem DDI
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  } else if (!digits.startsWith('55')) {
    digits = `55${digits}`;
  }

  if (digits.length < 12 || digits.length > 13) return null;
  return `+${digits}`;
}

function normalizeHeaderKey(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function suggestMapping(csvHeaders) {
  const mapping = {};
  const used = new Set();
  for (const header of csvHeaders) {
    const norm = normalizeHeaderKey(header);
    let key = HEADER_ALIASES[norm] || null;
    if (!key) {
      const byLabel = IMPORT_FIELDS.find(
        (f) => normalizeHeaderKey(f.label) === norm || normalizeHeaderKey(f.key) === norm
      );
      key = byLabel?.key || null;
    }
    if (key && !used.has(key) && FIELD_BY_KEY.has(key)) {
      mapping[header] = key;
      used.add(key);
    } else {
      mapping[header] = null;
    }
  }
  return mapping;
}

function listImportFields() {
  return {
    fields: IMPORT_FIELDS.map((f) => ({ ...f })),
    aliases: { ...HEADER_ALIASES },
  };
}

function parseCsvHeaders(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const first = raw.split(/\r?\n/).find((l) => l.trim() !== '');
  if (!first) return [];
  const { detectDelimiter, parseCsvLine } = require('../utils/csv');
  return parseCsvLine(first, detectDelimiter(first)).map((h) => h.trim());
}

function coerceRowsInput(body) {
  if (Array.isArray(body?.rows)) {
    return {
      headers: body.headers || Object.keys(body.rows[0] || {}).filter((k) => k !== '__line'),
      rows: body.rows.map((r, idx) => ({ ...r, __line: r.__line || r.line || idx + 2 })),
    };
  }
  if (typeof body?.csv === 'string') {
    const rows = parseCsvText(body.csv, { lowerHeaders: false });
    const headers =
      rows.length > 0
        ? Object.keys(rows[0]).filter((k) => k !== '__line')
        : parseCsvHeaders(body.csv);
    return { headers, rows };
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Informe csv (texto) ou rows (array)');
}

function applyMapping(rawRow, mapping) {
  const out = {};
  for (const [csvHeader, fieldKey] of Object.entries(mapping || {})) {
    if (!fieldKey || fieldKey === '__ignore' || fieldKey === 'ignore') continue;
    if (!FIELD_BY_KEY.has(fieldKey)) continue;
    const val = rawRow[csvHeader];
    if (val === undefined || val === null || String(val).trim() === '') continue;
    out[fieldKey] = String(val).trim();
  }
  return out;
}

function normalizeFieldValue(key, rawValue) {
  const field = FIELD_BY_KEY.get(key);
  const label = field?.label || key;
  const value = String(rawValue || '').trim();
  if (!value) return { ok: true, value: null };

  switch (field?.type) {
    case 'cpf': {
      if (!isValidCpf(value)) {
        return { ok: false, error: `${label} inválido` };
      }
      return { ok: true, value: formatCpf(value) };
    }
    case 'cep': {
      if (!isValidCep(value)) {
        return { ok: false, error: `${label} inválido (use 8 dígitos)` };
      }
      return { ok: true, value: formatCep(value) };
    }
    case 'phone': {
      const phone = formatPhoneBr(value);
      if (!phone) {
        return {
          ok: false,
          error: `${label} inválido (informe DDD + número; +55 será adicionado se faltar)`,
        };
      }
      return { ok: true, value: phone };
    }
    case 'email': {
      const email = value.toLowerCase();
      if (!isValidEmail(email)) {
        return { ok: false, error: `${label} inválido` };
      }
      return { ok: true, value: email };
    }
    case 'state': {
      const uf = value.toUpperCase().slice(0, 2);
      if (uf.length !== 2 || !/^[A-Z]{2}$/.test(uf)) {
        return { ok: false, error: `${label} inválida (use 2 letras, ex.: SP)` };
      }
      return { ok: true, value: uf };
    }
    case 'responsible_type': {
      const norm = normalizeHeaderKey(value);
      const mapped = RESPONSIBLE_TYPE_ALIASES[norm] || RESPONSIBLE_TYPE_ALIASES[value.toLowerCase()];
      if (!mapped) {
        return {
          ok: false,
          error: `${label} inválido (use: titular/himself, responsável/another ou pet)`,
        };
      }
      return { ok: true, value: mapped };
    }
    case 'date': {
      let iso = value;
      const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (br) {
        iso = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return { ok: false, error: `${label} inválida (use AAAA-MM-DD ou DD/MM/AAAA)` };
      }
      const d = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: `${label} inválida` };
      }
      return { ok: true, value: iso };
    }
    case 'datetime': {
      let raw = value;
      const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (br) {
        const hh = (br[4] || '0').padStart(2, '0');
        const mm = (br[5] || '0').padStart(2, '0');
        const ss = (br[6] || '0').padStart(2, '0');
        raw = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}T${hh}:${mm}:${ss}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        raw = `${value}T00:00:00`;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        return {
          ok: false,
          error: `${label} inválida (use AAAA-MM-DD, DD/MM/AAAA ou data/hora ISO)`,
        };
      }
      return { ok: true, value: d.toISOString() };
    }
    default:
      return { ok: true, value };
  }
}

function normalizeImportRow(mapped, line, defaults = {}) {
  const errors = [];
  const payload = {};

  for (const [key, raw] of Object.entries(mapped)) {
    const result = normalizeFieldValue(key, raw);
    if (!result.ok) errors.push(result.error);
    else if (result.value != null) payload[key] = result.value;
  }

  for (const [key, raw] of Object.entries(defaults || {})) {
    if (payload[key] != null && payload[key] !== '') continue;
    if (!FIELD_BY_KEY.has(key)) continue;
    if (raw == null || String(raw).trim() === '') continue;
    const result = normalizeFieldValue(key, raw);
    if (!result.ok) errors.push(result.error);
    else if (result.value != null) payload[key] = result.value;
  }

  if (payload.email && !payload.email_account) {
    payload.email_account = payload.email;
  }
  delete payload.email;

  if (!payload.email_account) {
    errors.push('E-mail da conta é obrigatório');
  }
  if (!payload.associate_name && !payload.fullname) {
    errors.push('Nome (ou Nome completo) é obrigatório');
  }
  if (!payload.associate_name && payload.fullname) {
    const parts = String(payload.fullname).trim().split(/\s+/);
    payload.associate_name = parts[0] || null;
    if (!payload.associate_last_name && parts.length > 1) {
      payload.associate_last_name = parts.slice(1).join(' ');
    }
  }
  if (!payload.associate_last_name) {
    errors.push('Sobrenome é obrigatório');
  }
  if (payload.associate_name && !payload.fullname) {
    payload.fullname = [payload.associate_name, payload.associate_last_name]
      .filter(Boolean)
      .join(' ');
  }

  if (!payload.associate_status) {
    payload.associate_status = PHASE.CADASTRO_CRIADO;
  }
  if (!payload.status) {
    payload.status = 'Associado';
  }

  return {
    line,
    ok: errors.length === 0,
    errors,
    payload,
    action: errors.length === 0 ? 'create' : 'skip',
  };
}

async function loadExistingKeys(emails, cpfs) {
  const existingEmails = new Set();
  const existingCpfs = new Set();

  if (emails.length) {
    const res = await query(
      `SELECT LOWER(email_account) AS email_account
       FROM users
       WHERE LOWER(email_account) = ANY($1::text[])
         AND (status IS NULL OR status <> 'patient')`,
      [emails]
    );
    for (const row of res.rows) {
      if (row.email_account) existingEmails.add(row.email_account);
    }
  }

  if (cpfs.length) {
    const digitsList = cpfs.map(onlyDigits);
    const res = await query(
      `SELECT associate_cpf FROM users
       WHERE regexp_replace(COALESCE(associate_cpf, ''), '\\D', '', 'g') = ANY($1::text[])`,
      [digitsList]
    );
    for (const row of res.rows) {
      const d = onlyDigits(row.associate_cpf);
      if (d) existingCpfs.add(d);
    }
  }

  return { existingEmails, existingCpfs };
}

function annotateDuplicates(rows, existingEmails, existingCpfs) {
  const seenEmails = new Set();
  const seenCpfs = new Set();

  return rows.map((row) => {
    if (!row.ok) return row;
    const errors = [...row.errors];
    const email = String(row.payload.email_account || '')
      .trim()
      .toLowerCase();
    const cpfDigits = onlyDigits(row.payload.associate_cpf);

    if (email) {
      if (existingEmails.has(email)) {
        errors.push('E-mail já cadastrado');
      } else if (seenEmails.has(email)) {
        errors.push('E-mail duplicado neste CSV');
      } else {
        seenEmails.add(email);
      }
    }

    if (cpfDigits) {
      if (existingCpfs.has(cpfDigits)) {
        errors.push('CPF já cadastrado');
      } else if (seenCpfs.has(cpfDigits)) {
        errors.push('CPF duplicado neste CSV');
      } else {
        seenCpfs.add(cpfDigits);
      }
    }

    if (errors.length) {
      return {
        ...row,
        ok: false,
        errors,
        action: 'skip',
      };
    }
    return row;
  });
}

async function validateImport(body = {}) {
  const { headers, rows: rawRows } = coerceRowsInput(body);
  const mapping =
    body.mapping && typeof body.mapping === 'object'
      ? body.mapping
      : suggestMapping(headers);

  const defaults = body.defaults && typeof body.defaults === 'object' ? body.defaults : {};

  const normalized = rawRows.map((raw) => {
    const mapped = applyMapping(raw, mapping);
    return normalizeImportRow(mapped, raw.__line || null, defaults);
  });

  const emails = [];
  const cpfs = [];
  for (const row of normalized) {
    if (!row.ok) continue;
    const email = String(row.payload.email_account || '')
      .trim()
      .toLowerCase();
    if (email) emails.push(email);
    const cpf = onlyDigits(row.payload.associate_cpf);
    if (cpf) cpfs.push(cpf);
  }

  const { existingEmails, existingCpfs } = await loadExistingKeys(
    [...new Set(emails)],
    [...new Set(cpfs)]
  );
  const annotated = annotateDuplicates(normalized, existingEmails, existingCpfs);

  const valid = annotated.filter((r) => r.ok).length;
  const invalid = annotated.length - valid;

  return {
    headers,
    mapping,
    suggested_mapping: suggestMapping(headers),
    fields: IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label, type: f.type })),
    total: annotated.length,
    valid,
    invalid,
    rows: annotated.map((r) => ({
      line: r.line,
      ok: r.ok,
      errors: r.errors,
      action: r.action,
      payload: r.payload,
    })),
  };
}

async function importUsers(body = {}) {
  const report = await validateImport(body);
  const toImport = report.rows.filter((r) => r.ok);
  let created = 0;
  const results = [];
  const now = new Date().toISOString();

  for (const row of toImport) {
    try {
      const createdAt = row.payload.created_date || now;
      const payload = {
        ...row.payload,
        user_code: uuidv4(),
        date_created: createdAt,
        created_date: createdAt,
        is_sample: false,
      };
      const data = await itemsRepository.createItem('users', payload);
      created += 1;
      results.push({
        line: row.line,
        ok: true,
        action: 'create',
        id: data.id,
        user_code: data.user_code,
        email: payload.email_account,
      });
    } catch (err) {
      results.push({
        line: row.line,
        ok: false,
        action: 'create',
        email: row.payload?.email_account,
        error: err.message || 'Falha ao gravar',
      });
    }
  }

  const skippedInvalid = report.rows.filter((r) => !r.ok);
  const writeFailed = results.filter((r) => !r.ok);

  return {
    created,
    skipped: skippedInvalid.length,
    failed: writeFailed.length,
    skipped_invalid: skippedInvalid.length,
    total_input: report.total,
    valid: report.valid,
    success: writeFailed.length === 0 && created > 0,
    mapping: report.mapping,
    rows: [
      ...skippedInvalid.map((r) => ({
        line: r.line,
        ok: false,
        action: 'skip',
        email: r.payload?.email_account,
        errors: r.errors,
      })),
      ...results,
    ],
  };
}

module.exports = {
  IMPORT_FIELDS,
  HEADER_ALIASES,
  listImportFields,
  suggestMapping,
  parseCsvText,
  formatPhoneBr,
  formatCpf,
  formatCep,
  isValidCpf,
  normalizeImportRow,
  applyMapping,
  normalizeFieldValue,
  validateImport,
  importUsers,
};
