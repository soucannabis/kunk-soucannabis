'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../db/pool');
const { stripSensitive } = require('../schema/collections');
const { AppError } = require('../utils/response');
const { env } = require('../config/env');
const { parseRoles } = require('../schema/rbac');
const { SALT_ROUNDS, hashPassword, verifyPassword } = require('../utils/password');
const { apiTokenLookupPrefix } = require('../utils/apiToken');
const { sha256Hex } = require('../utils/tokenHash');

function publicUser(row) {
  if (!row) return null;
  const clean = stripSensitive('system_users', row);
  return {
    id: clean.id,
    user_code: clean.user_code,
    name: clean.name,
    last_name: clean.last_name,
    email: clean.email,
    permissions: parseRoles(clean.permissions),
    internal_code: clean.internal_code,
    status: clean.status,
  };
}

async function findByEmail(email) {
  const result = await query(
    `SELECT * FROM system_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function ensureSessionsTable() {
  const { ensureOperatorSessions } = require('../db/ensureOperatorSessions');
  await ensureOperatorSessions();
}

function mapSessionRow(row) {
  return {
    user: row,
    session: {
      id: row.session_id,
      app: row.session_app,
      session_token: row.session_token_value,
      session_expires: row.session_expires_at,
      last_activity: row.session_last_activity,
      is_active: row.session_is_active,
    },
  };
}

async function loadActiveSessionByToken(storedToken) {
  const result = await query(
    `SELECT u.*,
            s.id AS session_id,
            s.app AS session_app,
            s.session_token AS session_token_value,
            s.session_expires AS session_expires_at,
            s.last_activity AS session_last_activity,
            s.is_active AS session_is_active
     FROM operator_sessions s
     INNER JOIN system_users u ON u.id = s.user_id
     WHERE s.session_token = $1 AND s.is_active = true
     LIMIT 1`,
    [storedToken]
  );
  return result.rows[0] || null;
}

/**
 * @returns {Promise<{ user: object, session: object }|null>}
 */
async function findBySessionToken(token) {
  if (!token) return null;
  await ensureSessionsTable();
  const hashed = sha256Hex(token);
  const hashedRow = await loadActiveSessionByToken(hashed);
  if (hashedRow) return mapSessionRow(hashedRow);

  const legacyRow = await loadActiveSessionByToken(token);
  if (!legacyRow) return null;
  await query(`UPDATE operator_sessions SET session_token = $1 WHERE id = $2`, [
    hashed,
    legacyRow.session_id,
  ]);
  legacyRow.session_token_value = hashed;
  return mapSessionRow(legacyRow);
}

async function login(email, password, app) {
  if (!email || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email e password são obrigatórios', {
      email: email ? undefined : ['obrigatório'],
      password: password ? undefined : ['obrigatório'],
    });
  }

  const { normalizeOperatorApp } = require('../constants/authCookies');
  const appKey = normalizeOperatorApp(app);
  if (!appKey) {
    throw new AppError(400, 'VALIDATION_ERROR', 'app inválido (kunk|admin|doc-sign)');
  }

  const user = await findByEmail(email);
  const valid = await verifyPassword(password, user?.password);
  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
  }

  if (user.status && String(user.status).toLowerCase() === 'inactive') {
    throw new AppError(403, 'USER_INACTIVE', 'Usuário inativo');
  }

  await ensureSessionsTable();

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + env.sessionMaxHours * 3600 * 1000);

  await query(
    `INSERT INTO operator_sessions (user_id, app, session_token, session_expires, last_activity, is_active)
     VALUES ($1, $2, $3, $4, NOW(), true)
     ON CONFLICT (user_id, app) DO UPDATE SET
       session_token = EXCLUDED.session_token,
       session_expires = EXCLUDED.session_expires,
       last_activity = NOW(),
       is_active = true`,
    [user.id, appKey, sha256Hex(sessionToken), expires]
  );

  const refreshed = await query(`SELECT * FROM system_users WHERE id = $1`, [user.id]);
  return { user: publicUser(refreshed.rows[0]), sessionToken, expires, app: appKey };
}

async function logout(sessionToken) {
  if (!sessionToken) return;
  await ensureSessionsTable();
  await query(
    `UPDATE operator_sessions SET is_active = false
     WHERE session_token = $1 OR session_token = $2`,
    [sha256Hex(sessionToken), sessionToken]
  );
}

async function logoutAllForUser(userId) {
  if (!userId) return;
  await ensureSessionsTable();
  await query(
    `UPDATE operator_sessions SET is_active = false WHERE user_id = $1`,
    [userId]
  );
}

async function touchSession(sessionId) {
  const expires = new Date(Date.now() + env.sessionMaxHours * 3600 * 1000);
  await query(
    `UPDATE operator_sessions SET last_activity = NOW(), session_expires = $1 WHERE id = $2`,
    [expires, sessionId]
  );
}

async function resolveSession(sessionToken) {
  if (!sessionToken) return null;
  const found = await findBySessionToken(sessionToken);
  if (!found) return null;
  const { user, session } = found;
  if (session.session_expires && new Date(session.session_expires) < new Date()) {
    await logout(sessionToken);
    return null;
  }
  await touchSession(session.id);
  return publicUser(user);
}

function parseScopesValue(raw) {
  if (Array.isArray(raw)) return raw.length ? raw : ['*'];
  if (raw == null) return ['*'];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* ignore */
    }
  }
  return ['*'];
}

/** Prefer dedicated scopes column; fall back to legacy JSON-in-email. */
function tokenMetaFromRow(row) {
  if (row.scopes != null) {
    let label = row.email || 'api-token';
    if (typeof label === 'string' && label.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(label);
        if (parsed && typeof parsed === 'object' && parsed.label) label = parsed.label;
      } catch {
        /* plain */
      }
    }
    return { label: String(label || 'api-token'), scopes: parseScopesValue(row.scopes) };
  }

  let label = row.email || 'api-token';
  let scopes = ['*'];
  try {
    const parsed = JSON.parse(row.email);
    label = parsed.label || row.email;
    scopes = parsed.scopes || ['*'];
  } catch {
    /* plain label */
  }
  return { label, scopes };
}

function publicTokenRow(row) {
  const { label, scopes } = tokenMetaFromRow(row);
  return { id: row.id, email: label, label, scopes };
}

async function ensureApiTokenPrefixColumn() {
  const { ensureUsersApiTokenPrefix } = require('../db/ensureUsersApiTokenPrefix');
  await ensureUsersApiTokenPrefix();
}

async function createApiToken({ email, label: labelIn, scopes = ['*'] }) {
  const { normalizeApiTokenScopes } = require('../schema/rbac');
  let normalizedScopes;
  try {
    normalizedScopes = normalizeApiTokenScopes(scopes);
  } catch (err) {
    throw new AppError(400, err.code || 'VALIDATION_ERROR', err.message);
  }
  await ensureApiTokenPrefixColumn();
  const plaintext = `kunk_live_${crypto.randomBytes(24).toString('hex')}`;
  const tokenPrefix = apiTokenLookupPrefix(plaintext);
  const hash = await bcrypt.hash(plaintext, SALT_ROUNDS);
  const label = String(labelIn || email || 'api-token').trim().slice(0, 255) || 'api-token';

  const result = await query(
    `INSERT INTO users_api (email, token, token_prefix, scopes)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, email, scopes`,
    [label, hash, tokenPrefix, JSON.stringify(normalizedScopes)]
  );

  return {
    id: result.rows[0].id,
    email: label,
    label,
    scopes: normalizedScopes,
    token: plaintext,
  };
}

async function listApiTokens() {
  const result = await query(`SELECT id, email, scopes FROM users_api ORDER BY id DESC`);
  return result.rows.map(publicTokenRow);
}

async function updateApiToken(id, { email, label: labelIn, scopes } = {}) {
  const { normalizeApiTokenScopes } = require('../schema/rbac');
  const existing = await query(`SELECT id, email, scopes FROM users_api WHERE id = $1`, [id]);
  if (!existing.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Token não encontrado');
  }
  const current = tokenMetaFromRow(existing.rows[0]);
  const label =
    labelIn !== undefined || email !== undefined
      ? String(labelIn || email || '').trim().slice(0, 255) || current.label
      : current.label;
  let nextScopes = current.scopes;
  if (scopes !== undefined) {
    try {
      nextScopes = normalizeApiTokenScopes(scopes);
    } catch (err) {
      throw new AppError(400, err.code || 'VALIDATION_ERROR', err.message);
    }
  }
  const result = await query(
    `UPDATE users_api SET email = $2, scopes = $3::jsonb WHERE id = $1 RETURNING id, email, scopes`,
    [id, label, JSON.stringify(nextScopes)]
  );
  return publicTokenRow(result.rows[0]);
}

async function revokeApiToken(id) {
  const result = await query(`DELETE FROM users_api WHERE id = $1 RETURNING id`, [id]);
  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Token não encontrado');
  }
  return { id: result.rows[0].id };
}

async function resolveBearer(token) {
  if (!token) return null;
  const prefix = apiTokenLookupPrefix(token);
  if (!prefix) return null;
  await ensureApiTokenPrefixColumn();
  const result = await query(
    `SELECT id, email, token, scopes FROM users_api WHERE token_prefix = $1 LIMIT 1`,
    [prefix]
  );
  const row = result.rows[0];
  if (!row?.token || !String(row.token).startsWith('$2')) return null;
  const match = await bcrypt.compare(token, row.token);
  if (!match) return null;
  const { label, scopes } = tokenMetaFromRow(row);
  return {
    id: row.id,
    email: label,
    scopes,
    roles: ['api'],
  };
}

function hashResetToken(token) {
  return sha256Hex(token);
}

function assertOperatorPassword(password) {
  if (!password || String(password).length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Senha deve ter no mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Senha precisa de maiúscula e caractere especial'
    );
  }
}

const OPERATOR_RESET_APPS = new Set(['kunk', 'admin', 'doc-sign']);

async function forgotPassword(email, app = 'kunk') {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email é obrigatório');
  }
  const appKey = String(app || 'kunk').toLowerCase();
  if (!OPERATOR_RESET_APPS.has(appKey)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'app inválido (kunk|admin|doc-sign)');
  }

  const user = await findByEmail(normalized);
  let resetToken = null;
  if (user && String(user.status || '').toLowerCase() !== 'inactive') {
    resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(resetToken);
    await query(
      `UPDATE system_users SET
         password_reset_token = $1,
         password_reset_expires = NOW() + interval '1 hour'
       WHERE id = $2`,
      [tokenHash, user.id]
    );

    try {
      const emailService = require('../services/email');
      const resetUrl = `${emailService.publicAppUrl(appKey)}/nova-senha?token=${encodeURIComponent(resetToken)}`;
      const tpl = emailService.templates.passwordReset({
        resetUrl,
        associationName: process.env.ASSOCIATION_NAME || null,
      });
      await emailService.sendTemplated(normalized, tpl);
    } catch {
      /* ignore mailer errors */
    }
  }

  return {
    ok: true,
    message: 'Se o e-mail existir, enviaremos instruções de redefinição.',
    ...(process.env.NODE_ENV === 'test' && resetToken ? { reset_token: resetToken } : {}),
  };
}

async function resetPassword(token, password) {
  if (!token || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'token e password são obrigatórios');
  }
  assertOperatorPassword(password);

  const tokenHash = hashResetToken(token);
  const result = await query(
    `SELECT * FROM system_users
     WHERE password_reset_token = $1
       AND password_reset_expires > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const user = result.rows[0];
  if (!user) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Token inválido ou expirado');
  }

  const hash = await hashPassword(password);
  await query(
    `UPDATE system_users SET
      password = $1,
      password_reset_token = NULL,
      password_reset_expires = NULL,
      session_token = NULL,
      is_session_active = false,
      status = CASE WHEN lower(coalesce(status, '')) = 'pending' THEN 'active' ELSE status END,
      date_updated = NOW()
     WHERE id = $2`,
    [hash, user.id]
  );
  await logoutAllForUser(user.id);

  return { ok: true };
}

module.exports = {
  publicUser,
  findByEmail,
  login,
  logout,
  logoutAllForUser,
  resolveSession,
  createApiToken,
  listApiTokens,
  updateApiToken,
  revokeApiToken,
  resolveBearer,
  hashPassword,
  forgotPassword,
  resetPassword,
  assertOperatorPassword,
  OPERATOR_RESET_APPS,
};
