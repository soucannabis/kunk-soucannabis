'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { env } = require('../config/env');
const systemUsersService = require('./systemUsersService');
const emailService = require('./email');
const { parseRoles } = require('../schema/rbac');

const INVITE_TTL_MS = 60 * 60 * 1000;

function inviteSecret() {
  return (
    process.env.SYSTEM_INVITE_SECRET ||
    env.configEncryptKey ||
    process.env.SESSION_SECRET ||
    'dev-invite-secret-change-me'
  );
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', inviteSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const raw = String(token || '');
  const parts = raw.split('.');
  if (parts.length !== 2) throw new AppError(400, 'INVALID_INVITE', 'Convite inválido');
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', inviteSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError(400, 'INVALID_INVITE', 'Convite inválido');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_INVITE', 'Convite inválido');
  }
  if (!payload?.exp || Date.now() > Number(payload.exp)) {
    throw new AppError(400, 'INVITE_EXPIRED', 'Convite expirado');
  }
  return payload;
}

function publicAppBase() {
  return emailService.publicAppUrl('kunk');
}

function normalizePermissionsList(value) {
  if (Array.isArray(value)) return value.map(String);
  return parseRoles(value);
}

/**
 * Build invite URL + optionally send e-mail.
 * @param {object} user - system_users public/row
 * @param {object} [opts]
 * @param {string[]} [opts.permissions]
 * @param {string} [opts.professional_code]
 * @param {boolean} [opts.sendEmail=true]
 */
async function buildInvite(user, opts = {}) {
  const permissions = normalizePermissionsList(opts.permissions || user.permissions || []);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const token = signPayload({
    system_user_id: user.id,
    email: user.email,
    professional_code: opts.professional_code || user.internal_code || null,
    permissions,
    exp: expiresAt.getTime(),
  });
  const inviteUrl = `${publicAppBase()}/cadastro?token=${encodeURIComponent(token)}`;

  const result = {
    system_user_id: user.id,
    invite_url: inviteUrl,
    expires_at: expiresAt.toISOString(),
    email_sent: false,
    email_status: 'skipped',
  };

  if (opts.sendEmail === false) {
    result.email_status = 'not_requested';
    return result;
  }

  const recipientName = [user.name, user.last_name].filter(Boolean).join(' ').trim();
  const tpl = emailService.templates.systemInvite({
    inviteUrl,
    recipientName,
    associationName: process.env.ASSOCIATION_NAME || null,
  });
  const mail = await emailService.sendTemplated(user.email, tpl);
  result.email_sent = Boolean(mail.email_sent);
  result.email_status = mail.email_status || (mail.skipped ? mail.reason : 'failed');
  return result;
}

async function previewInvite(token) {
  const payload = verifyToken(token);
  return {
    email: payload.email,
    expires_at: new Date(payload.exp).toISOString(),
    professional_code: payload.professional_code || null,
    permissions: payload.permissions || [],
  };
}

async function acceptInvite(body) {
  const payload = verifyToken(body?.token);
  const password = String(body?.password || '');
  const authRepository = require('../repositories/authRepository');
  authRepository.assertOperatorPassword(password);

  const userId = payload.system_user_id;
  const existing = await systemUsersService.getSystemUser(userId);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Usuário do convite não encontrado');
  if (String(existing.email || '').toLowerCase() !== String(payload.email || '').toLowerCase()) {
    throw new AppError(400, 'INVALID_INVITE', 'Convite não corresponde ao usuário');
  }

  const permissions = normalizePermissionsList(payload.permissions || existing.permissions);
  const updated = await systemUsersService.updateSystemUser(userId, {
    password,
    status: 'active',
    name: body.name != null ? body.name : existing.name,
    last_name: body.last_name != null ? body.last_name : existing.last_name,
    permissions: JSON.stringify(permissions.length ? permissions : ['Profissional']),
    internal_code: payload.professional_code || existing.internal_code,
  });

  return { user: updated };
}

async function inviteOperator(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email é obrigatório');
  }
  const existingEmail = await query(
    `SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [email]
  );
  if (existingEmail.rows[0]) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário do sistema com este e-mail');
  }

  const permissions = normalizePermissionsList(payload.permissions || []);
  if (!permissions.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Informe ao menos uma permissão (role)');
  }

  const user = await systemUsersService.createSystemUser({
    name: payload.name || null,
    last_name: payload.last_name || null,
    email,
    permissions: JSON.stringify(permissions),
    internal_code: payload.internal_code || null,
    status: 'pending',
    user_code: uuidv4(),
    date_created: new Date().toISOString(),
  });

  const invite = await buildInvite(user, { permissions, sendEmail: true });
  return { user, ...invite };
}

async function resendOperatorInvite(id) {
  const user = await systemUsersService.getSystemUser(id);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');
  const invite = await buildInvite(user, {
    permissions: user.permissions,
    sendEmail: true,
  });
  return { user, ...invite };
}

module.exports = {
  INVITE_TTL_MS,
  signPayload,
  verifyToken,
  buildInvite,
  previewInvite,
  acceptInvite,
  inviteOperator,
  resendOperatorInvite,
  publicAppBase,
};
