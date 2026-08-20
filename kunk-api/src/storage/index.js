'use strict';

const { resolveStorageConfig, assertCloudConfig } = require('./resolveConfig');
const { createLocalDriver } = require('./local');
const { AppError } = require('../utils/response');

/**
 * Build a driver instance for a given provider using resolved config.
 */
function buildDriver(name, cfg) {
  if (name === 'local') {
    return createLocalDriver({ rootPath: cfg.local.path });
  }
  if (name === 's3') {
    assertCloudConfig(cfg, 's3');
    const { createS3Driver } = require('./s3');
    return createS3Driver(cfg.s3);
  }
  if (name === 'gcs') {
    assertCloudConfig(cfg, 'gcs');
    const { createGcsDriver } = require('./gcs');
    return createGcsDriver(cfg.gcs);
  }
  throw new AppError(500, 'STORAGE_MISCONFIGURED', `Driver desconhecido: ${name}`);
}

/** Driver for NEW uploads (active global config). */
async function getActiveStorageDriver() {
  const cfg = await resolveStorageConfig();
  return { driver: buildDriver(cfg.driver, cfg), config: cfg };
}

/** Driver for an existing file row (may differ from the active driver). */
async function getDriverForFile(file) {
  const name = String(file.storage_driver || 'local').toLowerCase();
  const cfg = await resolveStorageConfig();
  return buildDriver(name, cfg);
}

function objectKeyForFile({ id, filename, keyPrefix }) {
  const safeName = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const prefix = keyPrefix || 'kunk/';
  if (prefix === '' || prefix === 'local/') {
    return `${id}_${safeName}`;
  }
  return `${prefix}${yyyy}/${mm}/${id}_${safeName}`;
}

module.exports = {
  getActiveStorageDriver,
  getDriverForFile,
  buildDriver,
  objectKeyForFile,
  resolveStorageConfig,
};
