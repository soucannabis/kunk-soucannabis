'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { withClient, query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { detectMimeFromBuffer } = require('../utils/fileType');
const authRepository = require('../repositories/authRepository');
const filesRepository = require('../repositories/filesRepository');
const { memoryCache, keys } = require('../cache');

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const UF_OPTIONS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const ASSOCIATION_FIELDS = [
  { key: 'associationName', label: 'Nome da associação', envKey: 'VITE_ASSOCIATION_NAME' },
  { key: 'associationFullName', label: 'Nome completo da associação', envKey: 'VITE_ASSOCIATION_FULL_NAME' },
  { key: 'associationEmail', label: 'E-mail', envKey: 'VITE_ASSOCIATION_EMAIL' },
  { key: 'associationPhone', label: 'Telefone', envKey: 'VITE_ASSOCIATION_PHONE' },
  { key: 'associationSite', label: 'Site', envKey: 'VITE_ASSOCIATION_SITE' },
  { key: 'associationCnpj', label: 'CNPJ', envKey: 'VITE_ASSOCIATION_CNPJ' },
  { key: 'associationCity', label: 'Cidade', envKey: 'VITE_ASSOCIATION_CITY' },
  { key: 'associationState', label: 'Estado', envKey: 'VITE_ASSOCIATION_STATE' },
];

const KEY_DESCRIPTIONS = {
  VITE_ASSOCIATION_NAME: 'Nome curto da associação (ex.: Minha Associação)',
  VITE_ASSOCIATION_FULL_NAME: 'Nome completo / razão social da associação',
  VITE_ASSOCIATION_EMAIL: 'E-mail de contato da associação',
  VITE_ASSOCIATION_PHONE: 'Telefone de contato da associação',
  VITE_ASSOCIATION_SITE: 'Site da associação',
  VITE_ASSOCIATION_CNPJ: 'CNPJ da associação',
  VITE_ASSOCIATION_CITY: 'Cidade da associação',
  VITE_ASSOCIATION_STATE: 'UF (estado) da associação',
  VITE_ASSOCIATION_LOGO: 'Logo principal da associação',
  VITE_ASSOCIATION_LOGO_MENU: 'Logo da associação no menu',
  VITE_ASSOCIATION_LOGO_SQUARE: 'Símbolo (1:1) da associação',
  VITE_ASSOCIATION_LOGO_RECTANGULAR: 'Logo completa (3:1) da associação',
  VITE_ASSOCIATION_LOGO_FORMAT: 'Formato legado (fallback de migração)',
  VITE_ASSOCIATION_LOGO_PLACEMENTS: 'Tipo e largura da logo por app (login/menu)',
  VITE_KUNK_LOGO: 'URL do logo (sidebar / login). Preferir /api/v1/files/{id}/download após upload.',
  VITE_KUNK_TITLE: 'Título exibido na sidebar do Kunk',
};

const DEFAULT_ROLE_PAGES = {
  Administrador: ['*'],
  Acolhimento: ['*'],
  Produção: ['*'],
  Financeiro: ['*'],
  Profissional: ['relatorios-servicos'],
};

const DEMO_SAMPLE_PENDING_SYSTEM = 'kunk';
const DEMO_SAMPLE_PENDING_KEY = 'demo_sample_pending';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function countSystemUsers(client = null) {
  const run = client ? client.query.bind(client) : query;
  const result = await run(`SELECT COUNT(*)::int AS c FROM system_users`);
  return result.rows[0].c;
}

async function hasSystemUsersTable(client = null) {
  const run = client ? client.query.bind(client) : query;
  const result = await run(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'system_users'
     ) AS exists`
  );
  return Boolean(result.rows[0]?.exists);
}

function resolveSchemaSqlPath() {
  const candidates = [
    process.env.SCHEMA_SQL_PATH,
    path.join(__dirname, '../../sql/target-schema.sql'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new AppError(
    500,
    'SCHEMA_FILE_MISSING',
    'Arquivo target-schema.sql não encontrado. Inclua kunk-api/sql/target-schema.sql.'
  );
}

async function getDemoSamplePending(client = null) {
  const run = client ? client.query.bind(client) : query;
  const result = await run(
    `SELECT value FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [DEMO_SAMPLE_PENDING_SYSTEM, DEMO_SAMPLE_PENDING_KEY]
  );
  return String(result.rows[0]?.value || '').trim().toLowerCase() === 'true';
}

async function setDemoSamplePending(client, pending) {
  await upsertConfig(client, {
    system: DEMO_SAMPLE_PENDING_SYSTEM,
    key: DEMO_SAMPLE_PENDING_KEY,
    value: pending ? 'true' : 'false',
    description: 'Instalação demo aguardando sample data (true/false)',
  });
}

async function getInstallStatus() {
  const schemaReady = await hasSystemUsersTable();
  if (!schemaReady) {
    return {
      needs_install: true,
      needs_schema: true,
      can_install_sample: false,
    };
  }

  const count = await countSystemUsers();
  let hasSample = false;
  let demoPending = false;
  if (count > 0) {
    const sampleCheck = await query(
      `SELECT EXISTS(SELECT 1 FROM users WHERE is_sample = true LIMIT 1) AS has_sample`
    );
    hasSample = Boolean(sampleCheck.rows[0]?.has_sample);
    demoPending = await getDemoSamplePending();
  }
  return {
    needs_install: count === 0,
    needs_schema: false,
    can_install_sample: count >= 1 && !hasSample && demoPending,
  };
}

/**
 * Aplica o DDL inicial (target-schema.sql) em banco vazio.
 * Idempotente se o schema já existir sem operadores.
 */
async function applySchema() {
  const schemaReady = await hasSystemUsersTable();
  if (schemaReady) {
    const count = await countSystemUsers();
    if (count > 0) {
      throw new AppError(409, 'ALREADY_INSTALLED', 'Sistema já instalado');
    }
    return { schema_ready: true, applied: false };
  }

  const sqlPath = resolveSchemaSqlPath();
  let sql;
  try {
    sql = fs.readFileSync(sqlPath, 'utf8');
  } catch (err) {
    throw new AppError(500, 'SCHEMA_FILE_MISSING', `Não foi possível ler o schema: ${err.message}`);
  }

  if (!String(sql).trim()) {
    throw new AppError(500, 'SCHEMA_FILE_MISSING', 'Arquivo de schema está vazio');
  }

  await withClient(async (client) => {
    await client.query(sql);
  });

  if (!(await hasSystemUsersTable())) {
    throw new AppError(500, 'SCHEMA_APPLY_FAILED', 'Schema aplicado, mas system_users não foi criada');
  }

  return { schema_ready: true, applied: true };
}

function decodeLogo(logoBase64, logoMime) {
  let raw = String(logoBase64 || '').trim();
  const mime = String(logoMime || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (!ALLOWED_LOGO_MIMES.has(mime)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo deve ser PNG, JPEG, WebP ou GIF');
  }
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    raw = dataUrlMatch[2];
  }
  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo base64 inválida');
  }
  if (!buffer.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo base64 inválida');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo deve ter no máximo 2 MB');
  }
  const detected = detectMimeFromBuffer(buffer);
  if (!detected || !ALLOWED_LOGO_MIMES.has(detected)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo deve ser PNG, JPEG, WebP ou GIF');
  }
  const ext = detected.includes('png')
    ? 'png'
    : detected.includes('webp')
      ? 'webp'
      : detected.includes('gif')
        ? 'gif'
        : 'jpg';
  return { buffer, mime: detected, filename: `install-logo.${ext}` };
}

function validateAssociation(association) {
  const src = association && typeof association === 'object' ? association : {};
  const missing = [];
  const normalized = {};

  for (const field of ASSOCIATION_FIELDS) {
    const raw = String(src[field.key] ?? '').trim();
    if (!raw) {
      missing.push(field.label);
      continue;
    }
    if (field.key === 'associationPhone' && onlyDigits(raw).length < 10) {
      missing.push('Telefone (completo)');
      continue;
    }
    if (field.key === 'associationCnpj' && onlyDigits(raw).length !== 14) {
      missing.push('CNPJ (14 dígitos)');
      continue;
    }
    if (field.key === 'associationState' && !UF_OPTIONS.has(raw.toUpperCase())) {
      missing.push('Estado (UF válida)');
      continue;
    }
    if (field.key === 'associationEmail' && !raw.includes('@')) {
      missing.push('E-mail da associação');
      continue;
    }
    normalized[field.key] =
      field.key === 'associationState' ? raw.toUpperCase() : raw;
  }

  if (missing.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Preencha todos os campos obrigatórios: ${missing.join(', ')}.`
    );
  }
  return normalized;
}

function validateAdminAccount(body) {
  const name = String(body?.name || '').trim();
  const lastName = String(body?.last_name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const passwordConfirm = String(body?.password_confirm || '');

  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Nome do administrador é obrigatório');
  }
  if (!email || !email.includes('@')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'E-mail do administrador é inválido');
  }
  if (password !== passwordConfirm) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Confirmação de senha não confere');
  }
  authRepository.assertOperatorPassword(password);

  return { name, lastName, email, password };
}

async function upsertConfig(client, { system, key, value, description }) {
  const existing = await client.query(
    `SELECT id FROM system_configs WHERE system = $1 AND key = $2 LIMIT 1`,
    [system, key]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE system_configs
       SET value = $1, value_type = 'string', is_sensitive = false, date_updated = NOW()
       WHERE id = $2`,
      [value, existing.rows[0].id]
    );
    return;
  }
  await client.query(
    `INSERT INTO system_configs (
       system, key, value, value_type, is_sensitive, is_required,
       allow_hardcoded, hardcoded_default, description, date_created
     ) VALUES ($1, $2, $3, 'string', false, false, true, $4, $5, NOW())`,
    [system, key, value, value || null, description || key]
  );
}

async function ensureRolePages(client) {
  const value = JSON.stringify(DEFAULT_ROLE_PAGES);
  await upsertConfig(client, {
    system: 'kunk',
    key: 'role_pages',
    value,
    description: 'Páginas por role no app Kunk (* = todas)',
  });
}

async function runInstall(payload = {}) {
  const account = validateAdminAccount(payload);
  const association = validateAssociation(payload.association);
  const logo = decodeLogo(payload.logo_base64, payload.logo_mime);
  const demoPending = Boolean(payload.demo);

  if (!(await hasSystemUsersTable())) {
    throw new AppError(
      409,
      'SCHEMA_REQUIRED',
      'Crie o banco de dados antes de configurar o administrador'
    );
  }

  const existingCount = await countSystemUsers();
  if (existingCount > 0) {
    throw new AppError(409, 'ALREADY_INSTALLED', 'Sistema já instalado');
  }

  let file = null;
  let logoUrl = null;
  if (logo) {
    file = await filesRepository.createFile({
      buffer: logo.buffer,
      filename: logo.filename,
      mimeType: logo.mime,
    });
    logoUrl = file.url || `/api/v1/files/${file.id}/download`;
  }

  try {
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const countResult = await client.query(`SELECT COUNT(*)::int AS c FROM system_users`);
        if (countResult.rows[0].c > 0) {
          throw new AppError(409, 'ALREADY_INSTALLED', 'Sistema já instalado');
        }

        const passwordHash = await authRepository.hashPassword(account.password);
        await client.query(
          `INSERT INTO system_users (
             email, password, name, last_name, permissions, status,
             user_code, date_created, date_updated, is_sample, is_session_active
           ) VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW(), false, false)`,
          [
            account.email,
            passwordHash,
            account.name,
            account.lastName || null,
            JSON.stringify(['Administrador']),
            uuidv4(),
          ]
        );

        for (const field of ASSOCIATION_FIELDS) {
          await upsertConfig(client, {
            system: 'registration',
            key: field.envKey,
            value: association[field.key],
            description: KEY_DESCRIPTIONS[field.envKey],
          });
        }

        if (logoUrl) {
          await upsertConfig(client, {
            system: 'registration',
            key: 'VITE_ASSOCIATION_LOGO',
            value: logoUrl,
            description: KEY_DESCRIPTIONS.VITE_ASSOCIATION_LOGO,
          });
          await upsertConfig(client, {
            system: 'registration',
            key: 'VITE_ASSOCIATION_LOGO_MENU',
            value: logoUrl,
            description: KEY_DESCRIPTIONS.VITE_ASSOCIATION_LOGO_MENU,
          });
          await upsertConfig(client, {
            system: 'registration',
            key: 'VITE_ASSOCIATION_LOGO_SQUARE',
            value: logoUrl,
            description: KEY_DESCRIPTIONS.VITE_ASSOCIATION_LOGO_SQUARE,
          });
          await upsertConfig(client, {
            system: 'registration',
            key: 'VITE_ASSOCIATION_LOGO_FORMAT',
            value: 'square',
            description: KEY_DESCRIPTIONS.VITE_ASSOCIATION_LOGO_FORMAT,
          });
          await upsertConfig(client, {
            system: 'registration',
            key: 'VITE_ASSOCIATION_LOGO_PLACEMENTS',
            value: '',
            description: KEY_DESCRIPTIONS.VITE_ASSOCIATION_LOGO_PLACEMENTS,
          });
          // Mesma URL nos apps que leem system=kunk (Kunk, cadastro, doc-sign login).
          await upsertConfig(client, {
            system: 'kunk',
            key: 'VITE_KUNK_LOGO',
            value: logoUrl,
            description: KEY_DESCRIPTIONS.VITE_KUNK_LOGO,
          });
        }

        const associationTitle = String(association.associationName || '').trim();
        if (associationTitle) {
          await upsertConfig(client, {
            system: 'kunk',
            key: 'VITE_KUNK_TITLE',
            value: associationTitle,
            description: KEY_DESCRIPTIONS.VITE_KUNK_TITLE,
          });
        }

        await ensureRolePages(client);
        await setDemoSamplePending(client, demoPending);

        await client.query('COMMIT');
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    if (file?.id) {
      try {
        await filesRepository.deleteFile(file.id);
      } catch {
        /* ignore orphan cleanup */
      }
    }
    throw err;
  }

  try {
    memoryCache.invalidate(keys.ATTENDANTS);
  } catch {
    /* ignore */
  }

  try {
    const docSignService = require('./docSignService');
    await docSignService.ensureDefaultTemplates();
  } catch {
    /* modelos podem ser garantidos no boot / listagem */
  }

  return { installed: true, logo_url: logoUrl, demo: demoPending };
}

/**
 * Instala sample data small após o bootstrap (system_users já existe).
 * Público só enquanto ainda não houver dados de sample.
 */
async function seedDemoSample() {
  const operators = await countSystemUsers();
  if (operators < 1) {
    throw new AppError(409, 'NOT_INSTALLED', 'Instale o administrador antes do sample data');
  }

  const sampleCheck = await query(
    `SELECT EXISTS(SELECT 1 FROM users WHERE is_sample = true LIMIT 1) AS has_sample`
  );
  if (sampleCheck.rows[0]?.has_sample) {
    throw new AppError(409, 'SAMPLE_ALREADY_INSTALLED', 'Sample data já instalado');
  }

  const demoPending = await getDemoSamplePending();
  if (!demoPending) {
    throw new AppError(409, 'DEMO_NOT_PENDING', 'Nenhuma instalação demo pendente');
  }

  const seedSmall = require('./seedSmallSample');
  if (typeof seedSmall.seedSmallSample !== 'function') {
    throw new AppError(
      500,
      'SEED_UNAVAILABLE',
      'Seed demo indisponível. Reinicie a API e tente novamente.'
    );
  }
  const counts = await seedSmall.seedSmallSample();

  await withClient(async (client) => {
    await setDemoSamplePending(client, false);
  });

  return { installed: true, counts };
}

module.exports = {
  getInstallStatus,
  applySchema,
  runInstall,
  seedDemoSample,
  ASSOCIATION_FIELDS,
  DEFAULT_ROLE_PAGES,
};
