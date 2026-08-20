'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatS3Error,
  formatGcsError,
  extractAwsMeta,
} = require('../../src/storage/formatCloudError');

describe('formatCloudError', () => {
  describe('formatS3Error', () => {
    it('traduz NoSuchBucket', () => {
      const msg = formatS3Error(
        { name: 'NoSuchBucket', message: 'The specified bucket does not exist' },
        { bucket: 'demo', region: 'sa-east-1', op: 'test-head' }
      );
      assert.match(msg, /não encontrado/i);
      assert.match(msg, /demo/);
      assert.match(msg, /sa-east-1/);
    });

    it('traduz AccessDenied no put do probe', () => {
      const msg = formatS3Error(
        { name: 'AccessDenied', message: 'Access Denied', $metadata: { httpStatusCode: 403 } },
        { bucket: 'demo', op: 'test-put' }
      );
      assert.match(msg, /Sem permissão para gravar/i);
      assert.match(msg, /_kunk_probe/);
    });

    it('traduz UnknownError com HTTP 403', () => {
      const msg = formatS3Error(
        { name: 'UnknownError', message: 'UnknownError', $metadata: { httpStatusCode: 403 } },
        { bucket: 'kunk-teste', region: 'sa-east-1', op: 'test-head' }
      );
      assert.equal(msg.includes('UnknownError'), false);
      assert.match(msg, /permissão|HeadBucket|IAM/i);
    });

    it('traduz SignatureDoesNotMatch', () => {
      const msg = formatS3Error(
        { name: 'SignatureDoesNotMatch', message: 'The request signature we calculated does not match' },
        { bucket: 'demo', op: 'test-head' }
      );
      assert.match(msg, /Secret Access Key/i);
    });

    it('traduz PermanentRedirect / região errada', () => {
      const msg = formatS3Error(
        { name: 'PermanentRedirect', message: 'The bucket is in this region' },
        { bucket: 'demo', region: 'us-east-1', op: 'test-head' }
      );
      assert.match(msg, /região/i);
    });
  });

  describe('formatGcsError', () => {
    it('traduz 404', () => {
      const msg = formatGcsError({ code: 404, message: 'Not Found' }, { bucket: 'demo' });
      assert.match(msg, /não encontrado/i);
    });

    it('traduz 403 no put', () => {
      const msg = formatGcsError(
        { code: 403, message: 'Permission denied' },
        { bucket: 'demo', op: 'test-put' }
      );
      assert.match(msg, /Sem permissão para gravar/i);
    });
  });

  describe('extractAwsMeta', () => {
    it('ignora mensagem UnknownError', () => {
      const meta = extractAwsMeta({
        name: 'UnknownError',
        message: 'UnknownError',
        $metadata: { httpStatusCode: 403 },
      });
      assert.equal(meta.message, '');
      assert.equal(meta.status, 403);
      assert.equal(meta.code, 'UnknownError');
    });
  });
});
