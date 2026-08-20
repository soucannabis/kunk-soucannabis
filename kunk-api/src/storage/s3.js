'use strict';

const { Readable } = require('stream');
const { AppError } = require('../utils/response');
const { loadProbeFile } = require('./probe');
const { formatS3Error } = require('./formatCloudError');

function createS3Driver(cfg) {
  let S3Client;
  let PutObjectCommand;
  let GetObjectCommand;
  let DeleteObjectCommand;
  let HeadBucketCommand;
  let ListObjectsV2Command;
  try {
    ({
      S3Client,
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
      HeadBucketCommand,
      ListObjectsV2Command,
    } = require('@aws-sdk/client-s3'));
  } catch (err) {
    throw new AppError(
      500,
      'STORAGE_MISCONFIGURED',
      `Pacote @aws-sdk/client-s3 não instalado no container: ${err.message}`
    );
  }

  const region = cfg.region || 'us-east-1';
  const clientConfig = {
    region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  };
  const client = new S3Client(clientConfig);
  const bucket = cfg.bucket;

  function s3Fail(err, op) {
    return new AppError(502, 'STORAGE_ERROR', formatS3Error(err, { bucket, region, op }));
  }

  function s3ConfigFail(err, op) {
    return new AppError(400, 'STORAGE_MISCONFIGURED', formatS3Error(err, { bucket, region, op }));
  }

  return {
    name: 's3',
    async put({ key, buffer, mimeType }) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
          })
        );
        return { key };
      } catch (err) {
        throw s3Fail(err, 'put');
      }
    },
    async get({ key }) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );
        if (!out.Body) {
          throw new AppError(404, 'NOT_FOUND', 'Objeto S3 vazio');
        }
        if (typeof out.Body.transformToWebStream === 'function') {
          return Readable.fromWeb(out.Body.transformToWebStream());
        }
        return out.Body;
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          throw new AppError(404, 'NOT_FOUND', 'Arquivo físico não encontrado');
        }
        throw s3Fail(err, 'get');
      }
    },
    async getBuffer({ key }) {
      const stream = await this.get({ key });
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async delete({ key }) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        /* best-effort */
      }
    },
    async exists({ key }) {
      try {
        await this.getBuffer({ key });
        return true;
      } catch (err) {
        if (err.code === 'NOT_FOUND') return false;
        throw err;
      }
    },
    async list({ prefix = '', maxKeys = 1000 } = {}) {
      try {
        const keys = [];
        let token;
        do {
          const out = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix || undefined,
              MaxKeys: Math.min(1000, Math.max(1, maxKeys - keys.length)),
              ContinuationToken: token,
            })
          );
          for (const obj of out.Contents || []) {
            if (obj.Key) {
              keys.push({
                key: obj.Key,
                size: obj.Size != null ? Number(obj.Size) : null,
                lastModified: obj.LastModified || null,
              });
            }
            if (keys.length >= maxKeys) return keys;
          }
          token = out.IsTruncated ? out.NextContinuationToken : undefined;
        } while (token);
        return keys;
      } catch (err) {
        throw s3Fail(err, 'list');
      }
    },
    async test() {
      if (!bucket || !String(bucket).trim()) {
        throw new AppError(400, 'STORAGE_MISCONFIGURED', 'Informe o nome do bucket S3');
      }
      if (!cfg.accessKeyId || !cfg.secretAccessKey) {
        throw new AppError(
          400,
          'STORAGE_MISCONFIGURED',
          'Preencha Access Key ID e Secret Access Key para testar o S3'
        );
      }

      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err) {
        throw s3ConfigFail(err, 'test-head');
      }

      const probe = loadProbeFile();
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: probe.key,
            Body: probe.buffer,
            ContentType: probe.mimeType || 'application/octet-stream',
          })
        );
      } catch (err) {
        throw s3ConfigFail(err, 'test-put');
      }

      let roundtrip;
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: probe.key })
        );
        if (!out.Body) {
          throw new AppError(
            400,
            'STORAGE_MISCONFIGURED',
            `Probe S3: upload ok, mas a leitura do objeto em _kunk_probe/ voltou vazia no bucket "${bucket}"`
          );
        }
        const stream =
          typeof out.Body.transformToWebStream === 'function'
            ? Readable.fromWeb(out.Body.transformToWebStream())
            : out.Body;
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        roundtrip = Buffer.concat(chunks);
      } catch (err) {
        if (err instanceof AppError) throw err;
        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probe.key }));
        } catch {
          /* ignore */
        }
        throw s3ConfigFail(err, 'test-get');
      }

      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probe.key }));
      } catch (err) {
        throw s3ConfigFail(err, 'test-delete');
      }

      if (!Buffer.isBuffer(roundtrip) || roundtrip.length === 0) {
        throw new AppError(
          400,
          'STORAGE_MISCONFIGURED',
          `Probe S3 falhou no bucket "${bucket}": arquivo vazio após upload/leitura`
        );
      }

      return {
        ok: true,
        message: `Bucket S3 "${bucket}" acessível (${region})`,
        probe_key: probe.key,
      };
    },
  };
}

module.exports = { createS3Driver };
