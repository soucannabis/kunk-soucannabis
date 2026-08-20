'use strict';

const { AppError } = require('../utils/response');
const { loadProbeFile } = require('./probe');
const { formatGcsError } = require('./formatCloudError');

function buildCredentials(cfg) {
  if (cfg.credentialsJson) {
    try {
      const parsed =
        typeof cfg.credentialsJson === 'string'
          ? JSON.parse(cfg.credentialsJson)
          : cfg.credentialsJson;
      return parsed;
    } catch (err) {
      throw new AppError(400, 'STORAGE_MISCONFIGURED', `GCS credentials_json inválido: ${err.message}`);
    }
  }
  if (cfg.clientEmail && cfg.privateKey) {
    return {
      client_email: cfg.clientEmail,
      private_key: cfg.privateKey,
    };
  }
  return null;
}

function createGcsDriver(cfg) {
  let Storage;
  try {
    ({ Storage } = require('@google-cloud/storage'));
  } catch (err) {
    throw new AppError(
      500,
      'STORAGE_MISCONFIGURED',
      `Pacote @google-cloud/storage não instalado no container: ${err.message}`
    );
  }

  const credentials = buildCredentials(cfg);
  const storageOpts = {};
  if (cfg.projectId) storageOpts.projectId = cfg.projectId;
  if (credentials) storageOpts.credentials = credentials;

  const storage = new Storage(storageOpts);
  const bucketName = cfg.bucket;
  const bucket = storage.bucket(bucketName);

  function gcsFail(err, op) {
    return new AppError(502, 'STORAGE_ERROR', formatGcsError(err, { bucket: bucketName, op }));
  }

  function gcsConfigFail(err, op) {
    return new AppError(400, 'STORAGE_MISCONFIGURED', formatGcsError(err, { bucket: bucketName, op }));
  }

  return {
    name: 'gcs',
    async put({ key, buffer, mimeType }) {
      try {
        const file = bucket.file(key);
        await file.save(buffer, {
          contentType: mimeType || 'application/octet-stream',
          resumable: false,
        });
        return { key };
      } catch (err) {
        throw gcsFail(err, 'put');
      }
    },
    async get({ key }) {
      try {
        const file = bucket.file(key);
        const [exists] = await file.exists();
        if (!exists) {
          throw new AppError(404, 'NOT_FOUND', 'Arquivo físico não encontrado');
        }
        return file.createReadStream();
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw gcsFail(err, 'get');
      }
    },
    async getBuffer({ key }) {
      try {
        const file = bucket.file(key);
        const [buf] = await file.download();
        return buf;
      } catch (err) {
        if (err.code === 404) {
          throw new AppError(404, 'NOT_FOUND', 'Arquivo físico não encontrado');
        }
        throw gcsFail(err, 'get');
      }
    },
    async delete({ key }) {
      try {
        await bucket.file(key).delete({ ignoreNotFound: true });
      } catch {
        /* best-effort */
      }
    },
    async exists({ key }) {
      const [exists] = await bucket.file(key).exists();
      return Boolean(exists);
    },
    async list({ prefix = '', maxKeys = 1000 } = {}) {
      try {
        const [files] = await bucket.getFiles({
          prefix: prefix || undefined,
          maxResults: Math.max(1, maxKeys),
          autoPaginate: false,
        });
        return (files || []).slice(0, maxKeys).map((f) => ({
          key: f.name,
          size: f.metadata?.size != null ? Number(f.metadata.size) : null,
          lastModified: f.metadata?.updated ? new Date(f.metadata.updated) : null,
        }));
      } catch (err) {
        throw gcsFail(err, 'list');
      }
    },
    async test() {
      if (!bucketName || !String(bucketName).trim()) {
        throw new AppError(400, 'STORAGE_MISCONFIGURED', 'Informe o nome do bucket GCS');
      }
      try {
        const [exists] = await bucket.exists();
        if (!exists) {
          throw new AppError(
            400,
            'STORAGE_MISCONFIGURED',
            `Bucket GCS "${bucketName}" não encontrado. Confira o nome e o project_id da service account.`
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw gcsConfigFail(err, 'test-head');
      }

      const probe = loadProbeFile();
      try {
        await bucket.file(probe.key).save(probe.buffer, {
          contentType: probe.mimeType || 'application/octet-stream',
          resumable: false,
        });
      } catch (err) {
        throw gcsConfigFail(err, 'test-put');
      }

      let roundtrip;
      try {
        const [buf] = await bucket.file(probe.key).download();
        roundtrip = buf;
      } catch (err) {
        try {
          await bucket.file(probe.key).delete({ ignoreNotFound: true });
        } catch {
          /* ignore */
        }
        throw gcsConfigFail(err, 'test-get');
      }

      try {
        await bucket.file(probe.key).delete({ ignoreNotFound: true });
      } catch (err) {
        throw gcsConfigFail(err, 'test-delete');
      }

      if (!Buffer.isBuffer(roundtrip) || roundtrip.length === 0) {
        throw new AppError(
          400,
          'STORAGE_MISCONFIGURED',
          `Probe GCS falhou no bucket "${bucketName}": arquivo vazio após upload/leitura`
        );
      }

      return {
        ok: true,
        message: `Bucket GCS "${bucketName}" acessível`,
        probe_key: probe.key,
      };
    },
  };
}

module.exports = { createGcsDriver };
