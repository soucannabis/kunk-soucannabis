'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { query, getPool } = require('../db/pool');
const { env } = require('../config/env');
const {
  resolveStorageConfig,
  assertCloudConfig,
  setStorageConfigValue,
} = require('../storage/resolveConfig');
const { buildDriver } = require('../storage');
const { AppError } = require('../utils/response');

/** Advisory lock key for backup/restore exclusivity */
const BACKUP_LOCK_KEY = 88442201;

const PG_TOOL_CANDIDATES = {
  'pg_dump': [
    process.env.PG_DUMP_PATH,
    '/usr/lib/postgresql/17/bin/pg_dump',
    '/usr/lib/postgresql/16/bin/pg_dump',
    '/usr/lib/postgresql/15/bin/pg_dump',
    '/usr/lib/postgresql/14/bin/pg_dump',
    '/usr/bin/pg_dump',
    'pg_dump',
  ].filter(Boolean),
  psql: [
    process.env.PSQL_PATH,
    '/usr/lib/postgresql/17/bin/psql',
    '/usr/lib/postgresql/16/bin/psql',
    '/usr/lib/postgresql/15/bin/psql',
    '/usr/lib/postgresql/14/bin/psql',
    '/usr/bin/psql',
    'psql',
  ].filter(Boolean),
};

function resolvePgTool(name) {
  const candidates = PG_TOOL_CANDIDATES[name] || [name];
  for (const candidate of candidates) {
    if (candidate === name) return candidate;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return name;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function stampNow(date = new Date()) {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `_${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`
  );
}

function parseScheduleTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

async function withAdvisoryLock(fn) {
  const client = await getPool().connect();
  try {
    const locked = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [BACKUP_LOCK_KEY]);
    if (!locked.rows[0]?.ok) {
      throw new AppError(409, 'BACKUP_BUSY', 'Já existe um backup ou restore em andamento');
    }
    try {
      return await fn(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [BACKUP_LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

function runProcess(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PATH: `/usr/bin:/bin:/usr/local/bin:${process.env.PATH || ''}`, ...(opts.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (d) => stdoutChunks.push(d));
    child.stderr.on('data', (d) => stderrChunks.push(d));
    child.on('error', (err) => {
      reject(
        new AppError(
          500,
          'BACKUP_TOOL_ERROR',
          `${path.basename(bin)} não disponível (${bin}): ${err.message}`
        )
      );
    });
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0) {
        reject(
          new AppError(
            500,
            'BACKUP_TOOL_ERROR',
            `${path.basename(bin)} falhou (code ${code}): ${stderr.slice(0, 2000) || 'sem stderr'}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function dumpSqlToFile(outPath) {
  const pgUrl = env.pgUrl;
  if (!pgUrl) {
    throw new AppError(500, 'BACKUP_MISCONFIGURED', 'PG_URL não configurada');
  }
  const pgDump = resolvePgTool('pg_dump');
  await runProcess(pgDump, ['--no-owner', '--no-acl', '-F', 'p', '-f', outPath, pgUrl]);
}

function safeTableFileName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || 'table';
}

/**
 * Exporta cada tabela public como um JSON separado.
 * @returns {{ exported_at: string, table_count: number, files: Array<{ name: string, file: string, rows: number, buffer: Buffer }> }}
 */
async function exportTablesJsonFiles() {
  const tablesRes = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const exportedAt = new Date().toISOString();
  const usedNames = new Set();
  const files = [];

  for (const row of tablesRes.rows) {
    const name = row.table_name;
    const safe = `"${String(name).replace(/"/g, '""')}"`;
    const data = await query(`SELECT * FROM ${safe}`);
    let fileBase = safeTableFileName(name);
    if (usedNames.has(fileBase)) {
      let i = 2;
      while (usedNames.has(`${fileBase}_${i}`)) i += 1;
      fileBase = `${fileBase}_${i}`;
    }
    usedNames.add(fileBase);
    const payload = {
      table: name,
      schema: 'public',
      exported_at: exportedAt,
      row_count: data.rows.length,
      rows: data.rows,
    };
    files.push({
      name,
      file: `${fileBase}.json`,
      rows: data.rows.length,
      buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
    });
  }

  return {
    exported_at: exportedAt,
    table_count: files.length,
    files,
  };
}

async function assertBackupAllowed(cfg) {
  const isCloud = cfg.driver === 's3' || cfg.driver === 'gcs';
  if (!isCloud || !cfg.locked) {
    throw new AppError(
      400,
      'BACKUP_DISABLED',
      'Backup só é permitido com bucket cloud autenticado e ativo'
    );
  }
  if (!cfg.backup?.enabled) {
    throw new AppError(400, 'BACKUP_DISABLED', 'Módulo de backup está desativado');
  }
  assertCloudConfig(cfg, cfg.driver);
}

function rowToPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    status: row.status,
    prefix: row.prefix,
    sql_key: row.sql_key,
    json_key: row.json_key,
    size_bytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    error: row.error || null,
    triggered_by: row.triggered_by,
  };
}

async function listRecent(limit = 5) {
  const result = await query(
    `SELECT id, created_at, status, prefix, sql_key, json_key, size_bytes, error, triggered_by
     FROM system_backups
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(50, Math.max(1, limit))]
  );
  return result.rows.map(rowToPublic);
}

async function getById(id) {
  const result = await query(
    `SELECT id, created_at, status, prefix, sql_key, json_key, size_bytes, error, triggered_by
     FROM system_backups WHERE id = $1`,
    [id]
  );
  return rowToPublic(result.rows[0] || null);
}

async function applyRetention(driver, retentionCount) {
  const keep = Math.max(1, Number(retentionCount) || 10);
  const old = await query(
    `SELECT id, prefix, sql_key, json_key
     FROM system_backups
     WHERE status = 'success'
     ORDER BY created_at DESC
     OFFSET $1`,
    [keep]
  );
  for (const row of old.rows) {
    await deleteBackupObjects(driver, row);
    await query(`DELETE FROM system_backups WHERE id = $1`, [row.id]);
  }
}

async function deleteBackupObjects(driver, row) {
  const keys = new Set();
  if (row.sql_key) keys.add(row.sql_key);
  if (row.json_key) keys.add(row.json_key);
  if (row.prefix) {
    keys.add(`${row.prefix}manifest.json`);
    try {
      // SQL + manifest + 1 JSON por tabela (pode passar de 100)
      const listed = await driver.list({ prefix: row.prefix, maxKeys: 5000 });
      for (const item of listed) {
        if (item.key) keys.add(item.key);
      }
    } catch {
      /* best-effort list */
    }
  }
  for (const key of keys) {
    await driver.delete({ key });
  }
}

async function runBackup({ triggered_by = 'manual' } = {}) {
  return withAdvisoryLock(async () => {
    const cfg = await resolveStorageConfig();
    await assertBackupAllowed(cfg);
    const driver = buildDriver(cfg.driver, cfg);

    const insert = await query(
      `INSERT INTO system_backups (status, triggered_by)
       VALUES ('running', $1)
       RETURNING id, created_at, status, prefix, sql_key, json_key, size_bytes, error, triggered_by`,
      [triggered_by]
    );
    const backupId = insert.rows[0].id;
    const stamp = stampNow();
    const prefix = `backups/${stamp}/`;
    const sqlKey = `${prefix}database.sql`;
    const jsonPrefix = `${prefix}tables/`;
    const manifestKey = `${prefix}manifest.json`;

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kunk-backup-'));
    const sqlPath = path.join(tmpDir, 'database.sql');

    try {
      await dumpSqlToFile(sqlPath);
      const sqlBuffer = await fsp.readFile(sqlPath);
      const jsonExport = await exportTablesJsonFiles();

      let jsonBytes = 0;
      const tableEntries = [];
      for (const file of jsonExport.files) {
        const key = `${jsonPrefix}${file.file}`;
        await driver.put({ key, buffer: file.buffer, mimeType: 'application/json' });
        jsonBytes += file.buffer.length;
        tableEntries.push({
          name: file.name,
          key,
          rows: file.rows,
          bytes: file.buffer.length,
        });
      }

      const manifest = {
        id: backupId,
        created_at: new Date().toISOString(),
        triggered_by,
        sql_key: sqlKey,
        json_prefix: jsonPrefix,
        json_key: jsonPrefix,
        table_count: jsonExport.table_count,
        sql_bytes: sqlBuffer.length,
        json_bytes: jsonBytes,
        tables: tableEntries,
      };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

      await driver.put({ key: sqlKey, buffer: sqlBuffer, mimeType: 'application/sql' });
      await driver.put({
        key: manifestKey,
        buffer: manifestBuffer,
        mimeType: 'application/json',
      });

      const sizeBytes = sqlBuffer.length + jsonBytes + manifestBuffer.length;
      const updated = await query(
        `UPDATE system_backups
         SET status = 'success',
             prefix = $2,
             sql_key = $3,
             json_key = $4,
             size_bytes = $5,
             error = NULL
         WHERE id = $1
         RETURNING id, created_at, status, prefix, sql_key, json_key, size_bytes, error, triggered_by`,
        [backupId, prefix, sqlKey, jsonPrefix, sizeBytes]
      );

      await applyRetention(driver, cfg.backup.retentionCount);
      return rowToPublic(updated.rows[0]);
    } catch (err) {
      const message = err instanceof AppError ? err.message : err.message || String(err);
      await query(
        `UPDATE system_backups SET status = 'failed', error = $2 WHERE id = $1`,
        [backupId, message.slice(0, 4000)]
      );
      throw err instanceof AppError
        ? err
        : new AppError(500, 'BACKUP_FAILED', message);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

async function deleteBackup(id) {
  const cfg = await resolveStorageConfig();
  if (!cfg.backup?.editable) {
    throw new AppError(400, 'BACKUP_DISABLED', 'Backup só é editável com bucket ativo');
  }
  const row = await getById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Backup não encontrado');
  }
  const driver = buildDriver(cfg.driver, cfg);
  await deleteBackupObjects(driver, row);
  await query(`DELETE FROM system_backups WHERE id = $1`, [id]);
  return { deleted: true, id };
}

async function restoreBackup(id, { confirm = false } = {}) {
  if (!confirm) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Restore requer confirm: true (operação destrutiva)'
    );
  }
  return withAdvisoryLock(async () => {
    const cfg = await resolveStorageConfig();
    if (!cfg.backup?.editable) {
      throw new AppError(400, 'BACKUP_DISABLED', 'Restore só é permitido com bucket ativo');
    }
    const row = await getById(id);
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Backup não encontrado');
    }
    if (row.status !== 'success' || !row.sql_key) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Backup inválido ou incompleto para restore');
    }

    const driver = buildDriver(cfg.driver, cfg);
    const sqlBuffer = await driver.getBuffer({ key: row.sql_key });
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kunk-restore-'));
    const sqlPath = path.join(tmpDir, 'database.sql');
    try {
      await fsp.writeFile(sqlPath, sqlBuffer);
      const pgUrl = env.pgUrl;
      if (!pgUrl) {
        throw new AppError(500, 'BACKUP_MISCONFIGURED', 'PG_URL não configurada');
      }
      await runProcess(resolvePgTool('psql'), ['-v', 'ON_ERROR_STOP=1', '-f', sqlPath, pgUrl]);
      return {
        restored: true,
        id: row.id,
        message: 'Backup SQL restaurado com sucesso',
      };
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

async function saveBackupConfig(body = {}) {
  const cfg = await resolveStorageConfig();
  if (!cfg.backup?.editable) {
    throw new AppError(
      400,
      'BACKUP_DISABLED',
      'Configure e ative o bucket antes de editar backups'
    );
  }

  if (body.enabled != null) {
    const enabled =
      body.enabled === true ||
      body.enabled === 'true' ||
      body.enabled === 1 ||
      body.enabled === '1';
    await setStorageConfigValue('backup.enabled', enabled ? 'true' : 'false');
  }

  if (body.schedule_time != null) {
    const parsed = parseScheduleTime(body.schedule_time);
    if (!parsed) {
      throw new AppError(400, 'VALIDATION_ERROR', 'schedule_time deve ser HH:MM');
    }
    await setStorageConfigValue(
      'backup.schedule_time',
      `${pad2(parsed.hour)}:${pad2(parsed.minute)}`
    );
  }

  if (body.timezone != null) {
    const tz = String(body.timezone).trim();
    if (!tz) {
      throw new AppError(400, 'VALIDATION_ERROR', 'timezone inválido');
    }
    await setStorageConfigValue('backup.timezone', tz);
  }

  if (body.retention_count != null) {
    const n = Number(body.retention_count);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      throw new AppError(400, 'VALIDATION_ERROR', 'retention_count deve ser entre 1 e 100');
    }
    await setStorageConfigValue('backup.retention_count', String(Math.floor(n)));
  }

  try {
    const { rescheduleBackupCron } = require('./backupCron');
    await rescheduleBackupCron();
  } catch (err) {
    console.warn('[backup] não foi possível reagendar cron:', err.message);
  }

  const storageAdminService = require('./storageAdminService');
  const status = await storageAdminService.getStatus();
  const recent = await listRecent(5);
  return { ...status, backups: recent };
}

module.exports = {
  listRecent,
  getById,
  runBackup,
  deleteBackup,
  restoreBackup,
  saveBackupConfig,
  parseScheduleTime,
  BACKUP_LOCK_KEY,
};
