'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const templates = require('../../src/services/email/templates');
const {
  normalizeConfig,
  formatSmtpError,
  SMTP_TIMEOUT_MS,
  testConnection,
} = require('../../src/services/email');
const { checkRateLimit, peekRateLimit, resetRateLimits, assertLoginRateLimit, recordLoginFailure } = require('../../src/utils/rateLimit');

describe('email templates', () => {
  it('builds password reset template', () => {
    const tpl = templates.passwordReset({
      resetUrl: 'https://example.com/nova-senha?token=abc',
      associationName: 'Assoc',
    });
    assert.ok(tpl.subject);
    assert.match(tpl.html, /nova-senha\?token=abc/);
    assert.match(tpl.text, /https:\/\/example.com/);
  });

  it('builds invite and contract templates', () => {
    const invite = templates.systemInvite({
      inviteUrl: 'https://kunk/cadastro?token=x',
      recipientName: 'Ana',
    });
    assert.match(invite.html, /Ana/);
    const sign = templates.contractSigningLink({
      signingUrl: 'https://doc/assinar/tok',
      signerName: 'Bob',
    });
    assert.match(sign.html, /assinar\/tok/);
    const done = templates.contractSignedConfirmation({ signerName: 'Bob' });
    assert.match(done.html, /assinatura/);
  });
});

describe('email normalizeConfig', () => {
  it('parses port and secure', () => {
    const cfg = normalizeConfig({
      host: 'smtp.test',
      port: '465',
      secure: 'true',
      from_email: 'a@b.c',
      from_name: 'Test',
    });
    assert.equal(cfg.host, 'smtp.test');
    assert.equal(cfg.port, 465);
    assert.equal(cfg.secure, true);
    assert.equal(cfg.fromEmail, 'a@b.c');
  });
});

describe('email formatSmtpError', () => {
  it('maps timeout and network failures', () => {
    assert.match(
      formatSmtpError({ code: 'SMTP_TIMEOUT', message: 'Timeout' }, { host: 'smtp.x', port: 587 }),
      /Tempo esgotado/
    );
    assert.match(
      formatSmtpError(
        { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' },
        { host: 'smtp.x', port: 25 }
      ),
      /recusada/
    );
    assert.match(
      formatSmtpError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }, { host: 'bad.host' }),
      /não encontrado/
    );
    assert.match(
      formatSmtpError({ responseCode: 535, message: 'Authentication failed' }, { host: 'smtp.x' }),
      /Autenticação SMTP rejeitada/
    );
  });

  it('exposes a finite SMTP timeout', () => {
    assert.ok(SMTP_TIMEOUT_MS >= 5000 && SMTP_TIMEOUT_MS <= 60000);
  });
});

describe('email testConnection timeout', () => {
  it('fails within timeout against a blackhole host', async () => {
    // 192.0.2.0/24 is TEST-NET-1 (RFC 5737) — should not route; verify would hang without timeout.
    const started = Date.now();
    await assert.rejects(
      () =>
        testConnection({
          host: '192.0.2.1',
          port: 465,
          secure: true,
          from_email: 'test@example.com',
          user: 'u',
          pass: 'p',
        }),
      /Tempo esgotado|recusada|interrompida|TLS|Falha/
    );
    const elapsed = Date.now() - started;
    assert.ok(
      elapsed < SMTP_TIMEOUT_MS + 5000,
      `testConnection demorou demais (${elapsed}ms); esperado < ${SMTP_TIMEOUT_MS + 5000}`
    );
  });
});

describe('rateLimit', () => {
  it('limits after N hits', () => {
    resetRateLimits();
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      assert.equal(checkRateLimit(key, { limit: 3, windowMs: 60000 }).ok, true);
    }
    assert.equal(checkRateLimit(key, { limit: 3, windowMs: 60000 }).ok, false);
  });

  it('peek does not consume quota', () => {
    resetRateLimits();
    const key = `peek-${Date.now()}`;
    assert.equal(peekRateLimit(key, { limit: 1, windowMs: 60000 }).ok, true);
    assert.equal(peekRateLimit(key, { limit: 1, windowMs: 60000 }).ok, true);
    assert.equal(checkRateLimit(key, { limit: 1, windowMs: 60000 }).ok, true);
    assert.equal(peekRateLimit(key, { limit: 1, windowMs: 60000 }).ok, false);
  });

  it('login rate limit is 5 failures per IP+email then 429', () => {
    resetRateLimits();
    const { env } = require('../../src/config/env');
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    const req = { ip: '10.0.0.8' };
    try {
      for (let i = 0; i < 5; i++) {
        assertLoginRateLimit(req, 'op-login', 'a@test.local');
        recordLoginFailure(req, 'op-login', 'a@test.local');
      }
      assert.throws(
        () => assertLoginRateLimit(req, 'op-login', 'a@test.local'),
        (err) => err.status === 429 && err.code === 'RATE_LIMITED'
      );
      assertLoginRateLimit(req, 'op-login', 'b@test.local');
    } finally {
      env.authEnumRateLimit = prev;
      resetRateLimits();
    }
  });

  it('login rate limit caps 30 failures per IP', () => {
    resetRateLimits();
    const { env } = require('../../src/config/env');
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    const req = { ip: '10.0.0.9' };
    try {
      for (let i = 0; i < 30; i++) {
        const email = `u${i}@test.local`;
        assertLoginRateLimit(req, 'op-login', email);
        recordLoginFailure(req, 'op-login', email);
      }
      assert.throws(
        () => assertLoginRateLimit(req, 'op-login', 'other@test.local'),
        (err) => err.status === 429 && err.code === 'RATE_LIMITED'
      );
    } finally {
      env.authEnumRateLimit = prev;
      resetRateLimits();
    }
  });
});
