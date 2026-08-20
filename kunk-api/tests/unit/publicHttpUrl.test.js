'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../src/utils/response');
const {
  isDisallowedIp,
  isBlockedHostname,
  assertPublicHttpUrl,
} = require('../../src/utils/publicHttpUrl');

describe('publicHttpUrl', () => {
  it('flags loopback, RFC1918, link-local and metadata IPs', () => {
    assert.equal(isDisallowedIp('127.0.0.1'), true);
    assert.equal(isDisallowedIp('10.0.0.4'), true);
    assert.equal(isDisallowedIp('192.168.1.1'), true);
    assert.equal(isDisallowedIp('172.16.0.1'), true);
    assert.equal(isDisallowedIp('169.254.169.254'), true);
    assert.equal(isDisallowedIp('::1'), true);
    assert.equal(isDisallowedIp('::ffff:127.0.0.1'), true);
    assert.equal(isDisallowedIp('8.8.8.8'), false);
    assert.equal(isDisallowedIp('127.0.0.1', { allowLoopback: true }), false);
    assert.equal(isDisallowedIp('169.254.169.254', { allowLoopback: true }), true);
  });

  it('blocks localhost and internal hostnames', () => {
    assert.equal(isBlockedHostname('localhost'), true);
    assert.equal(isBlockedHostname('metadata.google.internal'), true);
    assert.equal(isBlockedHostname('hooks.example.com'), false);
    assert.equal(isBlockedHostname('localhost', { allowLoopback: true }), false);
  });

  it('rejects private URLs even when loopback is allowed', async () => {
    await assert.rejects(
      () => assertPublicHttpUrl('http://169.254.169.254/latest', { allowLoopback: true }),
      (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => assertPublicHttpUrl('http://192.168.0.20/hook', { allowLoopback: false }),
      (err) => err instanceof AppError
    );
    await assert.rejects(
      () => assertPublicHttpUrl('http://127.0.0.1/hook', { allowLoopback: false }),
      (err) => err instanceof AppError
    );
  });

  it('rejects a public hostname that resolves to a private IP', async () => {
    await assert.rejects(
      () =>
        assertPublicHttpUrl('https://hooks.example.com/wh', {
          allowLoopback: false,
          lookup: async () => [{ address: '10.1.2.3', family: 4 }],
        }),
      (err) => err instanceof AppError && /interna/i.test(err.message)
    );
  });

  it('accepts https when DNS is public', async () => {
    const href = await assertPublicHttpUrl('https://hooks.example.com/wh', {
      allowLoopback: false,
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    });
    assert.equal(href, 'https://hooks.example.com/wh');
  });

  it('rejects non-http and credentials', async () => {
    await assert.rejects(() => assertPublicHttpUrl('ftp://example.com/x'), (err) => err instanceof AppError);
    await assert.rejects(
      () =>
        assertPublicHttpUrl('https://user:pass@hooks.example.com/wh', {
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        }),
      (err) => err instanceof AppError
    );
  });
});
