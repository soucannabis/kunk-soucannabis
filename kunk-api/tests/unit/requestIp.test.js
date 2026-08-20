'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { requestIp } = require('../../src/utils/rateLimit');
const { getApp } = require('../helpers/app');

describe('requestIp', () => {
  it('uses req.ip and ignores X-Forwarded-For', () => {
    assert.equal(
      requestIp({
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
      '10.0.0.1'
    );
  });

  it('falls back to socket, not the forwarded header', () => {
    assert.equal(
      requestIp({
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
      '127.0.0.1'
    );
  });

  it('does not trust X-Forwarded-For outside production', () => {
    const app = getApp();
    assert.equal(app.get('trust proxy'), false);
  });
});
