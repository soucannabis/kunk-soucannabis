'use strict';

/** JPEG mínimo (SOI + EOI). */
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/** 1x1 PNG transparente. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const TINY_PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

const TINY_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

module.exports = { TINY_JPEG, TINY_PNG, TINY_PDF, TINY_SVG };
