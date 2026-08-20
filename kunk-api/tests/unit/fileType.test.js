'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectMimeFromBuffer,
  assertAllowedUpload,
  contentDispositionFor,
  applyFileDownloadHeaders,
} = require('../../src/utils/fileType');
const { AppError } = require('../../src/utils/response');
const { TINY_JPEG, TINY_PNG, TINY_PDF, TINY_SVG } = require('../helpers/fileBuffers');

describe('fileType', () => {
  it('detects jpeg png pdf and svg from magic bytes', () => {
    assert.equal(detectMimeFromBuffer(TINY_JPEG), 'image/jpeg');
    assert.equal(detectMimeFromBuffer(TINY_PNG), 'image/png');
    assert.equal(detectMimeFromBuffer(TINY_PDF), 'application/pdf');
    assert.equal(detectMimeFromBuffer(TINY_SVG), 'image/svg+xml');
    assert.equal(detectMimeFromBuffer(Buffer.from('hello')), null);
  });

  it('allows jpeg/png/pdf and rejects svg or unknown', () => {
    assert.equal(assertAllowedUpload(TINY_JPEG), 'image/jpeg');
    assert.equal(assertAllowedUpload(TINY_PNG), 'image/png');
    assert.equal(assertAllowedUpload(TINY_PDF), 'application/pdf');
    assert.throws(
      () => assertAllowedUpload(TINY_SVG),
      (err) => err instanceof AppError && err.code === 'UNSUPPORTED_FILE_TYPE'
    );
    assert.throws(
      () => assertAllowedUpload(Buffer.from('not-a-file')),
      (err) => err.code === 'UNSUPPORTED_FILE_TYPE'
    );
  });

  it('strips CR/LF and quotes from Content-Disposition', () => {
    const header = contentDispositionFor('a"\r\nSet-Cookie: x=1.jpg', { inline: false });
    assert.equal(header.includes('\r'), false);
    assert.equal(header.includes('\n'), false);
    assert.match(header, /^attachment; filename="/);
    assert.match(header, /filename\*=UTF-8''/);
  });

  it('never inlines svg even if stored mime says image', () => {
    const headers = {};
    const res = { setHeader(name, value) { headers[name] = value; } };
    applyFileDownloadHeaders(res, { mime_type: 'image/svg+xml', filename: 'x.svg' });
    assert.equal(headers['Content-Type'], 'application/octet-stream');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.match(headers['Content-Disposition'], /^attachment;/);
  });

  it('inlines jpeg and pdf', () => {
    const headers = {};
    const res = { setHeader(name, value) { headers[name] = value; } };
    applyFileDownloadHeaders(res, { mime_type: 'image/jpeg', filename: 'rg.jpg' });
    assert.equal(headers['Content-Type'], 'image/jpeg');
    assert.match(headers['Content-Disposition'], /^inline;/);
  });
});
