'use strict';

const credentialsService = require('../credentialsService');
const { AppError } = require('../../utils/response');
const templates = require('./templates');

/** Tempo máximo para conectar / verificar / enviar via SMTP (ms). */
const SMTP_TIMEOUT_MS = 15000;

function getNodemailer() {
  try {
    // eslint-disable-next-line global-require
    return require('nodemailer');
  } catch (err) {
    const error = new Error(
      'Pacote nodemailer ausente. Rode npm install no kunk-api (ou no container).'
    );
    error.code = 'NODEMAILER_MISSING';
    throw error;
  }
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeConfig(raw = {}) {
  const host = String(raw.host || '').trim();
  const port = Number(raw.port || 587);
  const secure = asBool(raw.secure, port === 465);
  const user = String(raw.user || '').trim();
  const pass = String(raw.pass || '');
  const fromEmail = String(raw.from_email || '').trim();
  const fromName = String(raw.from_name || '').trim();
  return { host, port, secure, user, pass, fromEmail, fromName };
}

function assertMinimal(cfg) {
  if (!cfg.host) throw new Error('host SMTP é obrigatório');
  if (!cfg.port || Number.isNaN(cfg.port)) throw new Error('port SMTP inválida');
  if (!cfg.fromEmail) throw new Error('from_email é obrigatório');
}

/**
 * Mensagens claras para falhas SMTP (auth, rede, timeout).
 * @param {unknown} err
 * @param {{ host?: string, port?: number, op?: string }} [ctx]
 */
function formatSmtpError(err, ctx = {}) {
  const host = ctx.host || '';
  const port = ctx.port != null ? String(ctx.port) : '';
  const op = ctx.op || 'conexão SMTP';
  const target = host ? `${host}${port ? `:${port}` : ''}` : 'servidor SMTP';
  const code = String(err?.code || err?.responseCode || err?.name || '').trim();
  const raw = String(err?.message || err || '').trim();
  const lower = `${code} ${raw}`.toLowerCase();

  if (
    code === 'SMTP_TIMEOUT' ||
    /timeout|timed out|etimedout|esockettimedout|greeting never received/i.test(lower)
  ) {
    return (
      `Tempo esgotado na ${op} com ${target} (${Math.round(SMTP_TIMEOUT_MS / 1000)}s). ` +
      'Confira host, porta, firewall e se a porta aceita SMTP (587 STARTTLS ou 465 SSL).'
    );
  }
  if (/econnrefused|connection refused/i.test(lower)) {
    return `Conexão recusada em ${target}. Confira host/porta e se o SMTP está no ar.`;
  }
  if (/enotfound|getaddrinfo|dns/i.test(lower)) {
    return `Host SMTP "${host || 'informado'}" não encontrado (DNS). Confira o nome do servidor.`;
  }
  if (/econnreset|epipe|socket closed|connection closed/i.test(lower)) {
    return `Conexão com ${target} foi interrompida. Tente outra porta (587 vs 465) ou ajuste "secure".`;
  }
  if (
    /eprotocol|wrong version number|ssl|tls|certificate|self signed|unauthorized/i.test(lower)
  ) {
    return (
      `Falha TLS/SSL com ${target}. Porta 465 exige secure=true; porta 587 costuma usar STARTTLS (secure=false).`
    );
  }
  if (
    /invalid login|authentication failed|auth|credentials|535|534|530|username and password/i.test(
      lower
    )
  ) {
    return 'Autenticação SMTP rejeitada. Confira usuário e senha (ou senha de app do provedor).';
  }
  if (/certificate|self.signed|unable to verify/i.test(lower)) {
    return `Certificado TLS inválido em ${target}. Use o host oficial do provedor.`;
  }
  if (raw) return `Falha na ${op} com ${target}: ${raw}`;
  return `Falha na ${op} com ${target}`;
}

function buildTransport(cfg) {
  assertMinimal(cfg);
  const nodemailer = getNodemailer();
  const transportOpts = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
  if (cfg.user) {
    transportOpts.auth = { user: cfg.user, pass: cfg.pass };
  }
  return nodemailer.createTransport(transportOpts);
}

function fromHeader(cfg) {
  if (cfg.fromName) return `"${cfg.fromName.replace(/"/g, '')}" <${cfg.fromEmail}>`;
  return cfg.fromEmail;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(label);
      err.code = 'SMTP_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function withTransport(cfg, fn) {
  const transport = buildTransport(cfg);
  try {
    return await fn(transport);
  } finally {
    try {
      transport.close();
    } catch {
      /* ignore */
    }
  }
}

async function resolveSmtpConfig(override = null) {
  if (override) return normalizeConfig(override);
  const resolved = await credentialsService.resolveAll('email');
  return normalizeConfig(resolved);
}

async function isModuleEnabled() {
  const { isModuleEnabled: resolve } = require('../moduleFlags');
  return resolve('email');
}

async function isConfigured() {
  if (!(await isModuleEnabled())) return false;
  try {
    const cfg = await resolveSmtpConfig();
    return Boolean(cfg.host && cfg.fromEmail);
  } catch {
    return false;
  }
}

/** Lightweight SMTP verify (used by admin credential test). */
async function testConnection(creds) {
  const cfg = normalizeConfig(creds);
  assertMinimal(cfg);
  try {
    await withTransport(cfg, async (transport) => {
      await withTimeout(
        transport.verify(),
        SMTP_TIMEOUT_MS,
        `Timeout ao verificar SMTP ${cfg.host}:${cfg.port}`
      );
    });
  } catch (err) {
    throw new Error(formatSmtpError(err, { host: cfg.host, port: cfg.port, op: 'verificação SMTP' }));
  }
  return { ok: true };
}

async function sendMail({ to, subject, html, text, attachments } = {}, credsOverride = null) {
  if (!(await isModuleEnabled())) {
    return { skipped: true, reason: 'module_disabled' };
  }
  const cfg = await resolveSmtpConfig(credsOverride);
  if (!cfg.host || !cfg.fromEmail) {
    return { skipped: true, reason: 'smtp_not_configured' };
  }

  try {
    const info = await withTransport(cfg, async (transport) =>
      withTimeout(
        transport.sendMail({
          from: fromHeader(cfg),
          to,
          subject,
          html,
          text,
          attachments,
        }),
        SMTP_TIMEOUT_MS,
        `Timeout ao enviar e-mail via ${cfg.host}:${cfg.port}`
      )
    );
    return {
      skipped: false,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
    };
  } catch (err) {
    throw new Error(formatSmtpError(err, { host: cfg.host, port: cfg.port, op: 'envio SMTP' }));
  }
}

async function sendTemplated(to, templateResult, options = {}) {
  try {
    const result = await sendMail({
      to,
      subject: templateResult.subject,
      html: templateResult.html,
      text: templateResult.text,
      attachments: options.attachments,
    });
    if (result.skipped) {
      return { email_sent: false, email_status: result.reason, ...result };
    }
    return { email_sent: true, email_status: 'sent', ...result };
  } catch (err) {
    return {
      email_sent: false,
      email_status: 'failed',
      error: err.message || 'send_failed',
    };
  }
}

async function sendTestEmail({ to }, credsOverride = null) {
  const dest = String(to || '').trim().toLowerCase();
  if (!dest || !dest.includes('@')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Informe um e-mail válido para o teste');
  }
  const tpl = templates.smtpTest({ associationName: process.env.ASSOCIATION_NAME || 'Kunk' });
  if (credsOverride) {
    const cfg = normalizeConfig(credsOverride);
    assertMinimal(cfg);
    try {
      const info = await withTransport(cfg, async (transport) => {
        await withTimeout(
          transport.verify(),
          SMTP_TIMEOUT_MS,
          `Timeout ao verificar SMTP ${cfg.host}:${cfg.port}`
        );
        return withTimeout(
          transport.sendMail({
            from: fromHeader(cfg),
            to: dest,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
          }),
          SMTP_TIMEOUT_MS,
          `Timeout ao enviar e-mail via ${cfg.host}:${cfg.port}`
        );
      });
      return { ok: true, messageId: info.messageId || null };
    } catch (err) {
      throw new AppError(
        400,
        'CREDENTIAL_INVALID',
        formatSmtpError(err, { host: cfg.host, port: cfg.port, op: 'teste SMTP' })
      );
    }
  }
  if (!(await isModuleEnabled())) {
    throw new AppError(400, 'MODULE_DISABLED', 'Módulo de e-mail desabilitado no Admin');
  }
  try {
    const result = await sendMail({
      to: dest,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    if (result.skipped) {
      throw new AppError(400, 'SMTP_NOT_CONFIGURED', 'SMTP não configurado');
    }
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'CREDENTIAL_INVALID', err.message || 'Falha no envio de teste');
  }
}

function publicAppUrl(app) {
  const key = String(app || '').toLowerCase();
  const map = {
    kunk: process.env.KUNK_PUBLIC_URL || process.env.PUBLIC_APP_URL || 'http://localhost:4257',
    admin: process.env.ADMIN_PUBLIC_URL || 'http://localhost:4256',
    'doc-sign': process.env.DOC_SIGN_PUBLIC_URL || process.env.VITE_DOC_SIGN_URL || 'http://localhost:4258',
    registration:
      process.env.REGISTRATION_PUBLIC_URL ||
      process.env.CADASTRO_PUBLIC_URL ||
      'http://localhost:4255',
  };
  return String(map[key] || map.kunk).replace(/\/$/, '');
}

/** Garante metadados de credenciais mesmo sem o SQL de seed aplicado. */
async function ensureCredentialRows() {
  const { query } = require('../../db/pool');
  await query(
    `INSERT INTO system_api_credentials (
       service, field_key, encrypted_value, env_fallback, is_secret, description
     ) VALUES
       ('email', 'host', NULL, 'SMTP_HOST', false, 'Servidor SMTP (ex.: smtp.example.com)'),
       ('email', 'port', NULL, 'SMTP_PORT', false, 'Porta SMTP (ex.: 587 ou 465)'),
       ('email', 'secure', NULL, 'SMTP_SECURE', false, 'TLS implícito (true para porta 465)'),
       ('email', 'user', NULL, 'SMTP_USER', false, 'Usuário SMTP'),
       ('email', 'pass', NULL, 'SMTP_PASS', true, 'Senha SMTP'),
       ('email', 'from_email', NULL, 'SMTP_FROM', false, 'Remetente (From)'),
       ('email', 'from_name', NULL, 'SMTP_FROM_NAME', false, 'Nome do remetente')
     ON CONFLICT (service, field_key) DO NOTHING`
  );
}

module.exports = {
  templates,
  normalizeConfig,
  resolveSmtpConfig,
  isModuleEnabled,
  isConfigured,
  testConnection,
  sendMail,
  sendTemplated,
  sendTestEmail,
  publicAppUrl,
  ensureCredentialRows,
  formatSmtpError,
  SMTP_TIMEOUT_MS,
};
