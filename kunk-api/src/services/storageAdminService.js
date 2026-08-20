'use strict';

const {
  resolveStorageConfig,
  assertCloudConfig,
  setStorageConfigValue,
  DRIVERS,
  BACKUP_FOLDER_KEY,
} = require('../storage/resolveConfig');
const { buildDriver } = require('../storage');
const credentialsService = require('./credentialsService');
const filesRepository = require('../repositories/filesRepository');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

const BACKUP_ACTIVATE_DEFAULTS = {
  enabled: 'true',
  schedule_time: '22:00',
  timezone: 'America/Sao_Paulo',
  retention_count: '10',
};

/** Branding assets that should live in the active cloud bucket. */
const BRANDING_ASSET_KEYS = [
  { system: 'kunk', key: 'VITE_KUNK_LOGO', label: 'Logo ativa (Kunk / apps)', kind: 'logo' },
  { system: 'registration', key: 'VITE_ASSOCIATION_LOGO', label: 'Logo ativa da associação', kind: 'logo' },
  {
    system: 'registration',
    key: 'VITE_ASSOCIATION_LOGO_MENU',
    label: 'Logo da associação (menu)',
    kind: 'logo',
  },
  {
    system: 'registration',
    key: 'VITE_ASSOCIATION_LOGO_SQUARE',
    label: 'Logo quadrada',
    kind: 'logo',
  },
  {
    system: 'registration',
    key: 'VITE_ASSOCIATION_LOGO_RECTANGULAR',
    label: 'Logo retangular',
    kind: 'logo',
  },
  { system: 'kunk', key: 'VITE_KUNK_BG_IMAGE', label: 'Imagem de fundo', kind: 'background' },
];

function extractFileIdFromDownloadUrl(href) {
  const match = String(href || '').match(/\/files\/([^/?#]+)\/download/i);
  return match?.[1] || null;
}

function isPlaceholderLogo(href) {
  const url = String(href || '').trim();
  if (!url) return true;
  const path = url.split('?')[0].toLowerCase();
  return path === '/logo.svg' || path.endsWith('/logo.svg');
}

function publicStatusFromConfig(cfg, extras = {}) {
  const isCloud = cfg.driver === 's3' || cfg.driver === 'gcs';
  return {
    driver: cfg.driver,
    driver_source: cfg.driverSource,
    locked: cfg.locked,
    key_prefix: cfg.keyPrefix,
    is_cloud: isCloud,
    s3: {
      bucket: cfg.s3.bucket || '',
      region: cfg.s3.region || '',
      has_credentials: Boolean(cfg.s3.accessKeyId && cfg.s3.secretAccessKey),
    },
    gcs: {
      bucket: cfg.gcs.bucket || '',
      project_id: cfg.gcs.projectId || '',
      has_credentials: Boolean(
        cfg.gcs.credentialsJson || (cfg.gcs.clientEmail && cfg.gcs.privateKey)
      ),
    },
    local: {
      path: cfg.local.path,
    },
    backup: {
      enabled: Boolean(cfg.backup?.enabled),
      schedule_time: cfg.backup?.scheduleTime || '22:00',
      timezone: cfg.backup?.timezone || 'America/Sao_Paulo',
      retention_count: cfg.backup?.retentionCount ?? 10,
      editable: Boolean(cfg.backup?.editable),
    },
    ...extras,
  };
}

async function getStatus() {
  const cfg = await resolveStorageConfig();
  const [localPending, cloudCount, brandingMigration] = await Promise.all([
    filesRepository.countLocalFiles(),
    filesRepository.countCloudFiles(),
    listBrandingMigrationStatus(),
  ]);
  const [s3Creds, gcsCreds] = await Promise.all([
    credentialsService.listPublic('storage_s3'),
    credentialsService.listPublic('storage_gcs'),
  ]);
  return publicStatusFromConfig(cfg, {
    local_files_pending: localPending,
    cloud_files_count: cloudCount,
    branding_migration: brandingMigration,
    // Sempre permite alterar bucket/credenciais; troca de provedor só se não houver arquivos na nuvem
    can_change: true,
    can_change_provider: cloudCount === 0,
    credentials: {
      storage_s3: s3Creds,
      storage_gcs: gcsCreds,
    },
  });
}

async function assertCanChangeProvider(cfg, nextDriver) {
  const cloudCount = await filesRepository.countCloudFiles();
  if (cfg.driver !== 'local' && nextDriver === 'local') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Não é possível voltar para armazenamento local após ativar nuvem'
    );
  }
  if (
    cfg.driver !== 'local' &&
    nextDriver &&
    nextDriver !== cfg.driver &&
    cloudCount > 0
  ) {
    throw new AppError(
      409,
      'STORAGE_LOCKED',
      'Já existem arquivos no bucket atual. Não é possível trocar de provedor (S3 ↔ GCS). Você pode alterar o nome do bucket do mesmo provedor.'
    );
  }
}

/**
 * Save public config + optional credentials. Does not activate driver unless activate=true path.
 */
async function saveConfig(body = {}) {
  const cfg = await resolveStorageConfig();
  const driver = body.driver != null ? String(body.driver).toLowerCase() : null;

  if (driver && !DRIVERS.has(driver)) {
    throw new AppError(400, 'VALIDATION_ERROR', `driver inválido: ${driver}`);
  }

  if (driver && driver !== cfg.driver) {
    await assertCanChangeProvider(cfg, driver);
  }

  if (body.key_prefix != null) {
    await setStorageConfigValue('key_prefix', body.key_prefix);
  }

  if (body.s3 && typeof body.s3 === 'object') {
    if (body.s3.bucket != null) await setStorageConfigValue('s3.bucket', body.s3.bucket);
    if (body.s3.region != null) await setStorageConfigValue('s3.region', body.s3.region);
  }

  if (body.gcs && typeof body.gcs === 'object') {
    if (body.gcs.bucket != null) await setStorageConfigValue('gcs.bucket', body.gcs.bucket);
    if (body.gcs.project_id != null) await setStorageConfigValue('gcs.project_id', body.gcs.project_id);
  }

  if (body.credentials?.storage_s3 && typeof body.credentials.storage_s3 === 'object') {
    const fields = Object.fromEntries(
      Object.entries(body.credentials.storage_s3).filter(([, v]) => v != null && String(v).trim() !== '')
    );
    if (Object.keys(fields).length) {
      await credentialsService.putCredentials('storage_s3', fields, { runTest: false });
    }
  }
  if (body.credentials?.storage_gcs && typeof body.credentials.storage_gcs === 'object') {
    const fields = Object.fromEntries(
      Object.entries(body.credentials.storage_gcs).filter(([, v]) => v != null && String(v).trim() !== '')
    );
    if (Object.keys(fields).length) {
      await credentialsService.putCredentials('storage_gcs', fields, { runTest: false });
    }
  }

  // Persist driver only when explicitly requested and not activating yet —
  // activate endpoint sets driver after successful test.
  if (driver && body.set_driver === true) {
    await setStorageConfigValue('driver', driver);
  }

  return getStatus();
}

async function enableBackupDefaults() {
  await setStorageConfigValue('backup.enabled', BACKUP_ACTIVATE_DEFAULTS.enabled);
  await setStorageConfigValue('backup.schedule_time', BACKUP_ACTIVATE_DEFAULTS.schedule_time);
  await setStorageConfigValue('backup.timezone', BACKUP_ACTIVATE_DEFAULTS.timezone);
  await setStorageConfigValue('backup.retention_count', BACKUP_ACTIVATE_DEFAULTS.retention_count);
}

async function ensureBackupsFolder(driver, cfg) {
  assertCloudConfig(cfg, driver);
  const d = buildDriver(driver, cfg);
  await d.put({
    key: BACKUP_FOLDER_KEY,
    buffer: Buffer.from(''),
    mimeType: 'application/octet-stream',
  });
}

async function finalizeCloudActivation(driver) {
  await setStorageConfigValue('driver', driver);
  await setStorageConfigValue('locked', 'true');

  const activeCfg = await resolveStorageConfig();
  await ensureBackupsFolder(driver, activeCfg);
  await enableBackupDefaults();

  try {
    const { rescheduleBackupCron } = require('./backupCron');
    await rescheduleBackupCron();
  } catch (err) {
    console.warn('[storage] não foi possível reagendar cron de backup:', err.message);
  }
}

async function testConnection(body = {}) {
  // Optionally merge pending body into a temp config for test-before-save
  let cfg = await resolveStorageConfig();
  const driver = String(body.driver || cfg.driver || 'local').toLowerCase();

  if (body.s3) {
    cfg = {
      ...cfg,
      s3: {
        ...cfg.s3,
        bucket: body.s3.bucket != null ? body.s3.bucket : cfg.s3.bucket,
        region: body.s3.region != null ? body.s3.region : cfg.s3.region,
        accessKeyId: body.credentials?.storage_s3?.access_key_id || cfg.s3.accessKeyId,
        secretAccessKey: body.credentials?.storage_s3?.secret_access_key || cfg.s3.secretAccessKey,
      },
    };
  }
  if (body.gcs) {
    cfg = {
      ...cfg,
      gcs: {
        ...cfg.gcs,
        bucket: body.gcs.bucket != null ? body.gcs.bucket : cfg.gcs.bucket,
        projectId: body.gcs.project_id != null ? body.gcs.project_id : cfg.gcs.projectId,
        clientEmail: body.credentials?.storage_gcs?.client_email || cfg.gcs.clientEmail,
        privateKey: (body.credentials?.storage_gcs?.private_key || cfg.gcs.privateKey || '').replace(
          /\\n/g,
          '\n'
        ),
        credentialsJson: body.credentials?.storage_gcs?.credentials_json || cfg.gcs.credentialsJson,
      },
    };
  }

  if (driver === 'local') {
    const local = buildDriver('local', cfg);
    return local.test();
  }

  const currentCfg = await resolveStorageConfig();
  await assertCanChangeProvider(currentCfg, driver);

  assertCloudConfig(cfg, driver);
  const d = buildDriver(driver, cfg);
  const result = await d.test();

  // Teste OK → persistir config pública + credenciais e ativar o módulo
  await saveConfig({
    ...body,
    driver,
    set_driver: false,
  });

  const service = driver === 's3' ? 'storage_s3' : 'storage_gcs';
  await credentialsService.markTestResult(service, true);
  await finalizeCloudActivation(driver);

  const status = await getStatus();
  return {
    ...result,
    saved: true,
    activated: true,
    message: `${result.message}. Bucket ativado e módulo de backup habilitado.`,
    status,
  };
}

async function activate(body = {}) {
  const driver = String(body.driver || '').toLowerCase();
  if (driver !== 's3' && driver !== 'gcs') {
    throw new AppError(400, 'VALIDATION_ERROR', 'driver deve ser s3 ou gcs');
  }

  const testResult = await testConnection({ ...body, driver });
  return {
    ...testResult.status,
    test: testResult,
    message:
      testResult.message ||
      'Bucket ativado. Pasta backups criada e módulo de backup habilitado com opções padrão.',
  };
}

/**
 * Inspect branding configs for file ids still on local disk.
 */
async function listBrandingMigrationStatus() {
  const keys = BRANDING_ASSET_KEYS.map((a) => a.key);
  const systems = [...new Set(BRANDING_ASSET_KEYS.map((a) => a.system))];
  let rows = [];
  try {
    const result = await query(
      `SELECT system, key, value
       FROM system_configs
       WHERE system = ANY($1::text[])
         AND key = ANY($2::text[])
         AND value IS NOT NULL
         AND TRIM(value) <> ''`,
      [systems, keys]
    );
    rows = result.rows;
  } catch {
    return {
      pending_count: 0,
      cloud_count: 0,
      assets: [],
      needs_assistant: false,
    };
  }

  const bySystemKey = Object.fromEntries(rows.map((r) => [`${r.system}.${r.key}`, r.value]));
  const assets = [];
  const seenFileIds = new Set();

  for (const spec of BRANDING_ASSET_KEYS) {
    const raw = bySystemKey[`${spec.system}.${spec.key}`];
    if (isPlaceholderLogo(raw)) continue;
    const fileId = extractFileIdFromDownloadUrl(raw);
    if (!fileId) continue;
    if (seenFileIds.has(fileId) && spec.kind === 'logo') {
      // Same blob referenced by multiple logo keys — keep first entry, note aliases.
      const existing = assets.find((a) => a.file_id === fileId);
      if (existing && !existing.config_keys.includes(spec.key)) {
        existing.config_keys.push(spec.key);
        existing.labels.push(spec.label);
      }
      continue;
    }
    seenFileIds.add(fileId);

    let file = null;
    try {
      file = await filesRepository.getFile(fileId);
    } catch {
      continue;
    }
    const driver = String(file.storage_driver || 'local').toLowerCase();
    const isLocal = driver === 'local';
    assets.push({
      file_id: fileId,
      kind: spec.kind,
      label: spec.label,
      labels: [spec.label],
      config_keys: [spec.key],
      url: file.url || filesRepository.fileUrl(fileId),
      filename: file.filename,
      storage_driver: driver,
      pending: isLocal,
    });
  }

  const pending = assets.filter((a) => a.pending);
  return {
    pending_count: pending.length,
    cloud_count: assets.filter((a) => !a.pending).length,
    assets,
    needs_assistant: pending.length > 0,
  };
}

/**
 * Migrate local branding blobs (logo / fundo) into the active cloud bucket.
 * Keeps the same file ids so config URLs stay `/api/v1/files/{id}/download`.
 */
async function migrateBrandingAssets() {
  const cfg = await resolveStorageConfig();
  if (cfg.driver !== 's3' && cfg.driver !== 'gcs') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Ative um bucket (S3 ou GCS) antes de migrar a logo'
    );
  }

  const status = await listBrandingMigrationStatus();
  const pending = status.assets.filter((a) => a.pending);
  if (!pending.length) {
    return {
      migrated: [],
      skipped: status.assets,
      message: 'Nenhuma logo local pendente — já está no bucket ou não há logo configurada.',
      branding_migration: await listBrandingMigrationStatus(),
    };
  }

  const migrated = [];
  const errors = [];
  for (const asset of pending) {
    try {
      const result = await filesRepository.migrateFileToCloud(asset.file_id);
      migrated.push({
        ...asset,
        pending: false,
        storage_driver: result.file?.storage_driver || cfg.driver,
        storage_key: result.file?.storage_key || null,
        url: result.file?.url || asset.url,
        migrated: Boolean(result.migrated),
        skipped: Boolean(result.skipped),
      });
    } catch (err) {
      errors.push({
        file_id: asset.file_id,
        label: asset.label,
        message: err.message || 'Falha ao migrar',
      });
    }
  }

  const brandingMigration = await listBrandingMigrationStatus();
  if (errors.length && !migrated.length) {
    throw new AppError(
      502,
      'STORAGE_ERROR',
      errors.map((e) => `${e.label}: ${e.message}`).join(' · '),
      { errors }
    );
  }

  const logoMigrated = migrated.filter((m) => m.kind === 'logo').length;
  const parts = [];
  if (logoMigrated) {
    parts.push(
      logoMigrated === 1
        ? 'Logo enviada para o bucket'
        : `${logoMigrated} assets de logo enviados para o bucket`
    );
  }
  const bgMigrated = migrated.filter((m) => m.kind === 'background').length;
  if (bgMigrated) parts.push('imagem de fundo migrada');
  if (errors.length) parts.push(`${errors.length} falha(s)`);

  return {
    migrated,
    errors,
    message: parts.join('; ') || 'Migração concluída',
    branding_migration: brandingMigration,
    // URL lógica permanece /files/:id/download — o blob agora está no bucket.
    note: 'A URL pública da logo continua /api/v1/files/{id}/download; o arquivo passou a ser lido do bucket.',
  };
}

module.exports = {
  getStatus,
  saveConfig,
  testConnection,
  activate,
  enableBackupDefaults,
  ensureBackupsFolder,
  listBrandingMigrationStatus,
  migrateBrandingAssets,
  BACKUP_ACTIVATE_DEFAULTS,
  BRANDING_ASSET_KEYS,
};
