#!/usr/bin/env node
'use strict';

/**
 * Remove arquivos com storage_driver local (blobs no disco + linhas no banco).
 *
 * Uso:
 *   cd kunk-api && npm run clean:local-files              # dry-run
 *   cd kunk-api && npm run clean:local-files -- --yes     # apaga de verdade
 *   cd kunk-api && npm run clean:local-files -- --yes --sweep-disk
 *
 * Na raiz do monorepo:
 *   npm run clean:local-files -- --yes
 *
 * Flags:
 *   --yes         Executa a exclusão (sem isso só lista)
 *   --sweep-disk  Depois, apaga qualquer arquivo órfão restante em STORAGE_PATH
 *   --disk-only   Só esvazia STORAGE_PATH (não mexe no banco)
 */

const fsp = require('fs/promises');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query, closePool } = require('../src/db/pool');
const { env } = require('../src/config/env');
const filesRepository = require('../src/repositories/filesRepository');

function parseArgs(argv) {
  return {
    yes: argv.includes('--yes'),
    sweepDisk: argv.includes('--sweep-disk'),
    diskOnly: argv.includes('--disk-only'),
  };
}

async function listLocalFiles() {
  const result = await query(
    `SELECT id, filename, mime_type, storage_key, storage_path, created_at
     FROM files
     WHERE COALESCE(storage_driver, 'local') = 'local'
     ORDER BY created_at ASC NULLS LAST, id ASC`
  );
  return result.rows;
}

async function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
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
        /* ignore non-empty / race */
      }
    } else if (entry.isFile()) {
      await fsp.unlink(abs);
      deleted += 1;
    }
  }
  return { deleted };
}

async function loadReferencedLocalPaths() {
  const result = await query(
    `SELECT storage_key, storage_path
     FROM files
     WHERE COALESCE(storage_driver, 'local') = 'local'`
  );
  const root = path.resolve(env.storagePath);
  const set = new Set();
  for (const row of result.rows) {
    for (const key of [row.storage_key, row.storage_path]) {
      if (!key) continue;
      const abs = path.isAbsolute(key) ? key : path.join(root, key);
      set.add(path.resolve(abs));
    }
  }
  return set;
}

async function sweepOrphanDiskFiles({ yes }) {
  const root = path.resolve(env.storagePath);
  const referenced = await loadReferencedLocalPaths();
  const onDisk = await walkFiles(root);
  const orphans = onDisk.filter((abs) => !referenced.has(path.resolve(abs)));

  console.log(`\nÓrfãos em ${root}: ${orphans.length}`);
  for (const abs of orphans.slice(0, 20)) {
    console.log(`  - ${path.relative(root, abs) || abs}`);
  }
  if (orphans.length > 20) console.log(`  … +${orphans.length - 20} mais`);

  if (!yes) return { deleted: 0, found: orphans.length };

  let deleted = 0;
  for (const abs of orphans) {
    try {
      await fsp.unlink(abs);
      deleted += 1;
    } catch (err) {
      console.warn(`  falha ao apagar ${abs}: ${err.message}`);
    }
  }
  return { deleted, found: orphans.length };
}

async function main() {
  const { yes, sweepDisk, diskOnly } = parseArgs(process.argv);
  const root = path.resolve(env.storagePath);

  console.log(`STORAGE_PATH: ${root}`);
  console.log(`Modo: ${yes ? 'APAGAR' : 'dry-run (passe --yes para executar)'}`);
  if (diskOnly) console.log('Escopo: somente disco (--disk-only)');

  if (diskOnly) {
    const onDisk = await walkFiles(root);
    console.log(`\nArquivos em disco: ${onDisk.length}`);
    for (const abs of onDisk.slice(0, 30)) {
      console.log(`  - ${path.relative(root, abs) || abs}`);
    }
    if (onDisk.length > 30) console.log(`  … +${onDisk.length - 30} mais`);

    if (!yes) {
      console.log('\nNada foi apagado. Rode com --yes para confirmar.');
      return;
    }

    const { deleted } = await emptyDirectory(root);
    console.log(`\nDisco: ${deleted} arquivos removidos de ${root}`);
    return;
  }

  const rows = await listLocalFiles();
  console.log(`\nArquivos locais no banco: ${rows.length}`);
  for (const row of rows.slice(0, 30)) {
    const key = row.storage_key || row.storage_path || '—';
    console.log(`  - ${row.id}  ${row.filename}  (${key})`);
  }
  if (rows.length > 30) console.log(`  … +${rows.length - 30} mais`);

  if (!yes) {
    if (sweepDisk) await sweepOrphanDiskFiles({ yes: false });
    console.log('\nNada foi apagado. Rode com --yes para confirmar.');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    try {
      await filesRepository.deleteFile(row.id);
      ok += 1;
      if (ok % 25 === 0) console.log(`  … ${ok}/${rows.length}`);
    } catch (err) {
      fail += 1;
      console.warn(`  falha ${row.id} (${row.filename}): ${err.message}`);
    }
  }
  console.log(`\nBanco/disco: ${ok} removidos, ${fail} falhas`);

  if (sweepDisk) {
    const sweep = await sweepOrphanDiskFiles({ yes: true });
    console.log(`Sweep disco: ${sweep.deleted}/${sweep.found} órfãos removidos`);
  }

  const remaining = await listLocalFiles();
  console.log(`Restantes locais no banco: ${remaining.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
