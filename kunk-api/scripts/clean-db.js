#!/usr/bin/env node
'use strict';

/**
 * Limpa dados operacionais do PostgreSQL e remove uploads (local + storage ativo).
 * Também remove todos os system_users — operadores só devem ser criados pela UI/API.
 *
 * Uso:
 *   cd kunk-api && npm run clean:db              # dry-run
 *   cd kunk-api && npm run clean:db -- --yes     # executa
 *
 * Na raiz do monorepo:
 *   npm run clean:db -- --yes
 *
 * Flags:
 *   --yes                 Executa a limpeza (sem isso só lista o plano)
 *   --force               Permite rodar com NODE_ENV=production
 *   --wipe-configs        Também limpa system_configs (recria role_pages mínimo)
 *   --wipe-credentials    Também limpa system_api_credentials
 *
 * Preserva por padrão: system_configs e system_api_credentials (branding, módulos, secrets).
 *
 * Storage:
 *   1) Apaga cada blob listado em `files` (driver da linha)
 *   2) Esvazia STORAGE_PATH (local)
 *   3) Se o storage ativo for s3/gcs, apaga todos os objetos sob FILES_KEY_PREFIX
 */

const fsp = require('fs/promises');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { withClient, closePool } = require('../src/db/pool');
const { env } = require('../src/config/env');
const { getDriverForFile, getActiveStorageDriver, buildDriver } = require('../src/storage');
const { assertCloudConfig } = require('../src/storage/resolveConfig');

/** Tabelas de negócio / telemetria (ordem não importa com CASCADE). */
const DATA_TABLES = [
  'term_events',
  'term_signatures',
  'term_contracts',
  'term_template_versions',
  'term_templates',
  'orders_files',
  'services_files',
  'users_files',
  'product_stock_movements',
  'soucannabis_orders_audit',
  'orders',
  'services',
  'reception',
  'reports',
  'tags',
  'products',
  'institutional_clients',
  'professionals',
  'users_api',
  'users',
  'system_users',
  'files',
  'system_activity',
  'system_error_resolutions',
  'system_errors',
  'web_vitals',
];

const DEFAULT_ROLE_PAGES = {
  Administrador: ['*'],
  Acolhimento: ['*'],
  Produção: ['*'],
  Financeiro: ['*'],
  Profissional: ['relatorios-servicos'],
};

function parseArgs(argv) {
  return {
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
    wipeConfigs: argv.includes('--wipe-configs'),
    wipeCredentials: argv.includes('--wipe-credentials'),
  };
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return `"${name}"`;
}

async function listExistingTables(client, names) {
  const result = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [names]
  );
  return result.rows.map((r) => r.table_name);
}

async function countRows(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS c FROM ${quoteIdent(table)}`);
  return result.rows[0].c;
}

async function listAllFiles(client) {
  const exists = await listExistingTables(client, ['files']);
  if (!exists.length) return [];
  const result = await client.query(
    `SELECT id, filename, storage_driver, storage_key, storage_path
     FROM files
     ORDER BY created_at ASC NULLS LAST, id ASC`
  );
  return result.rows;
}

function groupFilesByDriver(files) {
  const map = {};
  for (const file of files) {
    const driver = String(file.storage_driver || 'local').toLowerCase();
    map[driver] = (map[driver] || 0) + 1;
  }
  return map;
}

async function ensureRolePages(client) {
  const value = JSON.stringify(DEFAULT_ROLE_PAGES);
  const existing = await client.query(
    `SELECT id FROM system_configs WHERE system = 'kunk' AND key = 'role_pages' LIMIT 1`
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE system_configs
       SET value = $1, value_type = 'json', is_sensitive = false, date_updated = NOW()
       WHERE id = $2`,
      [value, existing.rows[0].id]
    );
    return 'updated';
  }

  await client.query(
    `INSERT INTO system_configs (
       system, key, value, value_type, is_sensitive, is_required,
       allow_hardcoded, hardcoded_default, description, date_created
     ) VALUES (
       'kunk', 'role_pages', $1, 'json', false, false,
       true, $1, 'Páginas por role no app Kunk (* = todas)', NOW()
     )`,
    [value]
  );
  return 'inserted';
}

async function emptyDirectory(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { deleted: 0 };
    throw err;
  }

  let deleted = 0;
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deleted += (await emptyDirectory(abs)).deleted;
      try {
        await fsp.rmdir(abs);
      } catch {
        /* ignore */
      }
    } else if (entry.isFile()) {
      await fsp.unlink(abs);
      deleted += 1;
    }
  }
  return { deleted };
}

async function countLocalDiskFiles(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countLocalDiskFiles(abs);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function listS3Keys(cfg, prefix) {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: cfg.region || 'us-east-1',
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  const keys = [];
  let token;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      })
    );
    for (const obj of out.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function listGcsKeys(cfg, prefix) {
  const { Storage } = require('@google-cloud/storage');
  let credentials = null;
  if (cfg.credentialsJson) {
    credentials =
      typeof cfg.credentialsJson === 'string'
        ? JSON.parse(cfg.credentialsJson)
        : cfg.credentialsJson;
  } else if (cfg.clientEmail && cfg.privateKey) {
    credentials = { client_email: cfg.clientEmail, private_key: cfg.privateKey };
  }
  const opts = {};
  if (cfg.projectId) opts.projectId = cfg.projectId;
  if (credentials) opts.credentials = credentials;
  const storage = new Storage(opts);
  const [files] = await storage.bucket(cfg.bucket).getFiles({ prefix: prefix || undefined });
  return files.map((f) => f.name).filter(Boolean);
}

async function deleteFileBlobs(files) {
  let ok = 0;
  let fail = 0;
  for (const file of files) {
    const key = file.storage_key || file.storage_path;
    if (!key) continue;
    try {
      const driver = await getDriverForFile(file);
      await driver.delete({ key });
      ok += 1;
      if (ok % 50 === 0) console.log(`  … blobs ${ok}/${files.length}`);
    } catch (err) {
      fail += 1;
      console.warn(`  falha blob ${file.id} (${file.filename}): ${err.message}`);
    }
  }
  return { ok, fail };
}

async function purgeActiveCloudPrefix(config) {
  if (config.driver === 'local') {
    return { driver: 'local', listed: 0, deleted: 0, skipped: true };
  }

  try {
    assertCloudConfig(config, config.driver);
  } catch (err) {
    console.warn(`  storage ativo ${config.driver} incompleto — skip purge prefix: ${err.message}`);
    return { driver: config.driver, listed: 0, deleted: 0, skipped: true, error: err.message };
  }

  const prefix = config.keyPrefix || 'kunk/';
  let keys = [];
  if (config.driver === 's3') {
    keys = await listS3Keys(config.s3, prefix);
  } else if (config.driver === 'gcs') {
    keys = await listGcsKeys(config.gcs, prefix);
  } else {
    return { driver: config.driver, listed: 0, deleted: 0, skipped: true };
  }

  const driver = buildDriver(config.driver, config);
  let deleted = 0;
  for (const key of keys) {
    try {
      await driver.delete({ key });
      deleted += 1;
      if (deleted % 50 === 0) console.log(`  … prefix ${deleted}/${keys.length}`);
    } catch (err) {
      console.warn(`  falha prefix ${key}: ${err.message}`);
    }
  }
  return { driver: config.driver, prefix, listed: keys.length, deleted, skipped: false };
}

async function plan(client, args) {
  const tables = await listExistingTables(client, DATA_TABLES);
  const counts = [];
  for (const table of tables) {
    counts.push({ table, count: await countRows(client, table) });
  }

  const extras = [];
  if (args.wipeConfigs) {
    const exists = await listExistingTables(client, ['system_configs']);
    if (exists.length) extras.push({ table: 'system_configs', count: await countRows(client, 'system_configs') });
  }
  if (args.wipeCredentials) {
    const exists = await listExistingTables(client, ['system_api_credentials']);
    if (exists.length) {
      extras.push({
        table: 'system_api_credentials',
        count: await countRows(client, 'system_api_credentials'),
      });
    }
  }

  const files = await listAllFiles(client);
  const byDriver = groupFilesByDriver(files);
  const localRoot = path.resolve(env.storagePath);
  const localDiskCount = await countLocalDiskFiles(localRoot);

  let active = null;
  try {
    const { config } = await getActiveStorageDriver();
    active = {
      driver: config.driver,
      keyPrefix: config.keyPrefix,
      localPath: localRoot,
      s3Bucket: config.s3?.bucket || null,
      gcsBucket: config.gcs?.bucket || null,
    };
  } catch (err) {
    active = { error: err.message };
  }

  return { tables: counts, extras, files, byDriver, localDiskCount, localRoot, active };
}

async function runClean(client, args, files, storageConfig) {
  const tables = await listExistingTables(client, DATA_TABLES);
  if (!tables.length) {
    throw new Error('Nenhuma tabela de dados encontrada no schema public');
  }

  console.log(`\nRemovendo ${files.length} blob(s) referenciados em files…`);
  const blobs = await deleteFileBlobs(files);

  const localRoot = path.resolve(env.storagePath);
  console.log(`Esvaziando STORAGE_PATH: ${localRoot}`);
  const localSweep = await emptyDirectory(localRoot);

  console.log(`Limpando prefixo do storage ativo (${storageConfig.driver})…`);
  const cloudPurge = await purgeActiveCloudPrefix(storageConfig);

  await client.query('BEGIN');
  try {
    if (args.wipeCredentials) {
      const creds = await listExistingTables(client, ['system_api_credentials']);
      if (creds.length) {
        await client.query(`TRUNCATE TABLE ${quoteIdent('system_api_credentials')} RESTART IDENTITY CASCADE`);
      }
    }
    if (args.wipeConfigs) {
      const configs = await listExistingTables(client, ['system_configs']);
      if (configs.length) {
        await client.query(`TRUNCATE TABLE ${quoteIdent('system_configs')} RESTART IDENTITY CASCADE`);
      }
    }

    const quoted = tables.map(quoteIdent).join(', ');
    await client.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

    const rolePages = args.wipeConfigs ? await ensureRolePages(client) : 'skipped';

    await client.query('COMMIT');
    return { truncated: tables, rolePages, blobs, localSweep, cloudPurge };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!env.pgUrl) {
    console.error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) é obrigatória (kunk-api/.env)');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && !args.force) {
    console.error('Recusado em NODE_ENV=production. Use --force se tiver certeza.');
    process.exit(1);
  }

  try {
    await withClient(async (client) => {
      const preview = await plan(client, args);
      const total = [...preview.tables, ...preview.extras].reduce((s, r) => s + r.count, 0);

      console.log('Plano: truncar dados (incl. system_users) e apagar uploads. Não cria operadores.\n');
      for (const row of preview.tables) {
        console.log(`  ${row.table.padEnd(32)} ${row.count} linha(s)`);
      }
      for (const row of preview.extras) {
        console.log(`  ${row.table.padEnd(32)} ${row.count} linha(s)  [wipe]`);
      }
      console.log(`\nTotal aproximado: ${total} linha(s)`);
      console.log(`Preserva: system_configs${!args.wipeConfigs ? '' : ' (será limpa)'}, system_api_credentials${!args.wipeCredentials ? '' : ' (será limpa)'}`);

      console.log('\nStorage:');
      if (preview.active?.error) {
        console.log(`  ativo: erro ao resolver (${preview.active.error})`);
      } else {
        console.log(`  ativo: ${preview.active.driver}  prefix=${preview.active.keyPrefix}`);
        if (preview.active.driver === 's3') console.log(`  bucket S3: ${preview.active.s3Bucket || '(vazio)'}`);
        if (preview.active.driver === 'gcs') console.log(`  bucket GCS: ${preview.active.gcsBucket || '(vazio)'}`);
        console.log(`  STORAGE_PATH: ${preview.localRoot} (${preview.localDiskCount} arquivo(s) em disco)`);
      }
      const drivers = Object.entries(preview.byDriver);
      if (drivers.length) {
        console.log('  arquivos no banco:');
        for (const [driver, count] of drivers) {
          console.log(`    ${driver}: ${count}`);
        }
      } else {
        console.log('  arquivos no banco: 0');
      }

      console.log('\nOperadores: nenhum será criado (use Admin/API para cadastrar).\n');

      if (!args.yes) {
        console.log('Dry-run. Para executar: npm run clean:db -- --yes');
        return;
      }

      let storageConfig;
      try {
        ({ config: storageConfig } = await getActiveStorageDriver());
      } catch (err) {
        throw new Error(`Não foi possível resolver storage ativo antes de apagar blobs: ${err.message}`);
      }

      const result = await runClean(client, args, preview.files, storageConfig);
      console.log(`\nBlobs (files): ${result.blobs.ok} ok, ${result.blobs.fail} falhas`);
      console.log(`Disco local: ${result.localSweep.deleted} arquivo(s) removidos`);
      if (result.cloudPurge.skipped) {
        console.log(`Prefixo cloud: skip (${result.cloudPurge.driver}${result.cloudPurge.error ? `: ${result.cloudPurge.error}` : ''})`);
      } else {
        console.log(
          `Prefixo cloud (${result.cloudPurge.driver} ${result.cloudPurge.prefix}): ${result.cloudPurge.deleted}/${result.cloudPurge.listed}`
        );
      }
      console.log(`Truncadas: ${result.truncated.join(', ')}`);
      console.log(`role_pages: ${result.rolePages}`);
      console.log('\nPronto. Cadastre o primeiro operador pelo Admin (ou API).');
    });
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
