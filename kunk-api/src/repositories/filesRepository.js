'use strict';

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { assertAllowedUpload } = require('../utils/fileType');
const {
  getActiveStorageDriver,
  getDriverForFile,
  objectKeyForFile,
} = require('../storage');

const ATTACH_MAP = {
  orders: { table: 'orders_files', fk: 'order_id' },
  users: { table: 'users_files', fk: 'user_id' },
  services: { table: 'services_files', fk: 'service_id' },
};

function fileUrl(id) {
  return `/api/v1/files/${id}/download`;
}

function withUrl(row) {
  return { ...row, url: fileUrl(row.id) };
}

async function createFile({ buffer, filename, mimeType: _mimeType }) {
  const mime = assertAllowedUpload(buffer);
  const { driver, config } = await getActiveStorageDriver();
  const id = uuidv4();
  const safeName = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const displayName = filename || safeName;

  let storageKey;
  let storagePath = null;

  if (driver.name === 'local') {
    storageKey = `${id}_${safeName}`;
    const put = await driver.put({ key: storageKey, buffer, mimeType: mime, filename: displayName });
    storagePath = put.absolutePath || path.join(config.local.path, storageKey);
  } else {
    storageKey = objectKeyForFile({ id, filename: displayName, keyPrefix: config.keyPrefix });
    await driver.put({ key: storageKey, buffer, mimeType: mime, filename: displayName });
    storagePath = storageKey;
  }

  const result = await query(
    `INSERT INTO files (id, filename, mime_type, storage_path, storage_driver, storage_key, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
    [id, displayName, mime, storagePath, driver.name, storageKey]
  );

  return withUrl(result.rows[0]);
}

async function listFiles({ limit = 25, offset = 0, search = null, userId = null, docKind = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);

  if (userId != null && userId !== '') {
    const params = [userId];
    let where = 'WHERE uf.user_id = $1';
    if (docKind) {
      params.push(String(docKind));
      where += ` AND uf.doc_kind = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (f.filename ILIKE $${params.length} OR f.mime_type ILIKE $${params.length})`;
    }
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM users_files uf
       JOIN files f ON f.id = uf.file_id
       ${where}`,
      params
    );
    params.push(lim, off);
    const result = await query(
      `SELECT f.id, f.filename, f.mime_type, f.storage_path, f.storage_driver, f.storage_key, f.created_at,
              uf.doc_kind, uf.doc_type, uf.side, uf.subject, uf.user_id
       FROM users_files uf
       JOIN files f ON f.id = uf.file_id
       ${where}
       ORDER BY f.created_at DESC NULLS LAST, f.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      data: result.rows.map(withUrl),
      meta: {
        filter_count: countResult.rows[0].total,
        total_count: countResult.rows[0].total,
        limit: lim,
        offset: off,
      },
    };
  }

  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE filename ILIKE $${params.length} OR mime_type ILIKE $${params.length}`;
  }
  const countResult = await query(`SELECT COUNT(*)::int AS total FROM files ${where}`, params);
  params.push(lim, off);
  const result = await query(
    `SELECT id, filename, mime_type, storage_path, storage_driver, storage_key, created_at
     FROM files ${where}
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    data: result.rows.map(withUrl),
    meta: {
      filter_count: countResult.rows[0].total,
      total_count: countResult.rows[0].total,
      limit: lim,
      offset: off,
    },
  };
}

async function getFile(id) {
  const result = await query(`SELECT * FROM files WHERE id = $1`, [id]);
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Arquivo não encontrado');
  }
  return withUrl(result.rows[0]);
}

function fileObjectKey(file) {
  return file.storage_key || file.storage_path;
}

async function openFileStream(file) {
  const driver = await getDriverForFile(file);
  return driver.get({ key: fileObjectKey(file) });
}

async function readFileBuffer(fileOrId) {
  const file = typeof fileOrId === 'object' ? fileOrId : await getFile(fileOrId);
  const driver = await getDriverForFile(file);
  if (typeof driver.getBuffer === 'function') {
    return driver.getBuffer({ key: fileObjectKey(file) });
  }
  const stream = await driver.get({ key: fileObjectKey(file) });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function deleteFile(id) {
  const file = await getFile(id);
  await query(`DELETE FROM orders_files WHERE file_id = $1`, [id]);
  await query(`DELETE FROM users_files WHERE file_id = $1`, [id]);
  await query(`DELETE FROM services_files WHERE file_id = $1`, [id]);
  await query(`DELETE FROM files WHERE id = $1`, [id]);
  try {
    const driver = await getDriverForFile(file);
    await driver.delete({ key: fileObjectKey(file) });
  } catch {
    /* ignore missing blob */
  }
  return { id };
}

async function attachFile(fileId, collection, itemId, meta = {}) {
  const cfg = ATTACH_MAP[collection];
  if (!cfg) {
    throw new AppError(400, 'VALIDATION_ERROR', `Collection de attach inválida: ${collection}`);
  }
  await getFile(fileId);

  if (collection === 'users' && (meta.doc_type || meta.side || meta.subject || meta.doc_kind)) {
    const result = await query(
      `INSERT INTO users_files (user_id, file_id, doc_type, side, subject, doc_kind)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        itemId,
        fileId,
        meta.doc_type || null,
        meta.side || null,
        meta.subject || null,
        meta.doc_kind || null,
      ]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO ${cfg.table} (${cfg.fk}, file_id) VALUES ($1, $2) RETURNING *`,
    [itemId, fileId]
  );
  return result.rows[0];
}

async function detachFile(fileId, collection, itemId) {
  const cfg = ATTACH_MAP[collection];
  if (!cfg) {
    throw new AppError(400, 'VALIDATION_ERROR', `Collection de attach inválida: ${collection}`);
  }
  const result = await query(
    `DELETE FROM ${cfg.table} WHERE ${cfg.fk} = $1 AND file_id = $2 RETURNING id`,
    [itemId, fileId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Vínculo não encontrado');
  }
  return { id: result.rows[0].id };
}

async function countLocalFiles() {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM files
     WHERE COALESCE(storage_driver, 'local') = 'local'`
  );
  return result.rows[0].total;
}

async function countCloudFiles() {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM files
     WHERE storage_driver IN ('s3', 'gcs')`
  );
  return result.rows[0].total;
}

/**
 * Copy a local file blob into the active cloud driver and update the row in place.
 * Keeps the same file id (config URLs `/files/:id/download` remain valid).
 */
async function migrateFileToCloud(fileOrId) {
  const file = typeof fileOrId === 'object' ? fileOrId : await getFile(fileOrId);
  const currentDriver = String(file.storage_driver || 'local').toLowerCase();
  const { driver, config } = await getActiveStorageDriver();

  if (driver.name === 'local') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Ative um bucket (S3 ou GCS) antes de migrar arquivos locais'
    );
  }

  if (currentDriver === 's3' || currentDriver === 'gcs') {
    return {
      migrated: false,
      skipped: true,
      reason: 'already_cloud',
      file: withUrl(file),
    };
  }

  const buffer = await readFileBuffer(file);
  const oldKey = fileObjectKey(file);
  const newKey = objectKeyForFile({
    id: file.id,
    filename: file.filename,
    keyPrefix: config.keyPrefix,
  });

  await driver.put({
    key: newKey,
    buffer,
    mimeType: file.mime_type || 'application/octet-stream',
    filename: file.filename,
  });

  const result = await query(
    `UPDATE files
     SET storage_driver = $2,
         storage_key = $3,
         storage_path = $4
     WHERE id = $1
     RETURNING *`,
    [file.id, driver.name, newKey, newKey]
  );
  const updated = result.rows[0];

  try {
    const localDriver = await getDriverForFile({ ...file, storage_driver: 'local' });
    await localDriver.delete({ key: oldKey });
  } catch {
    /* ignore orphan local blob */
  }

  return {
    migrated: true,
    skipped: false,
    file: withUrl(updated),
  };
}

module.exports = {
  ATTACH_MAP,
  createFile,
  listFiles,
  getFile,
  openFileStream,
  readFileBuffer,
  deleteFile,
  attachFile,
  detachFile,
  countLocalFiles,
  countCloudFiles,
  migrateFileToCloud,
  fileObjectKey,
  fileUrl,
};
