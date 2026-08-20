'use strict';

const { AppError } = require('./response');

const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const INLINE_MIMES = ALLOWED_UPLOAD_MIMES;

function detectMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 6) {
    const gif = buffer.slice(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  }
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }

  const head = buffer
    .slice(0, Math.min(512, buffer.length))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (head.includes('<svg')) return 'image/svg+xml';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'text/html';
  return null;
}

function assertAllowedUpload(buffer) {
  const mime = detectMimeFromBuffer(buffer);
  if (!mime || !ALLOWED_UPLOAD_MIMES.has(mime)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'Tipo de arquivo não permitido');
  }
  return mime;
}

function sanitizeDownloadFilename(filename) {
  const raw = String(filename || 'file').replace(/[\r\n\0]/g, '');
  const fallback = raw.replace(/["\\]/g, '_').replace(/[^\x20-\x7E]/g, '_').slice(0, 120) || 'file';
  const encoded = encodeURIComponent(raw).slice(0, 240);
  return { fallback, encoded };
}

function contentDispositionFor(filename, { inline } = {}) {
  const { fallback, encoded } = sanitizeDownloadFilename(filename);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function applyFileDownloadHeaders(res, file) {
  const stored = String(file.mime_type || '').toLowerCase();
  const inline = INLINE_MIMES.has(stored);
  const mime = inline ? stored : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', contentDispositionFor(file.filename, { inline }));
}

module.exports = {
  ALLOWED_UPLOAD_MIMES,
  detectMimeFromBuffer,
  assertAllowedUpload,
  contentDispositionFor,
  applyFileDownloadHeaders,
};
