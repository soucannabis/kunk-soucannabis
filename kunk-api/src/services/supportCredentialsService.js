'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { stripSensitive } = require('../schema/collections');
const systemUsersService = require('./systemUsersService');
const authRepository = require('../repositories/authRepository');

const SUPPORT_INTERNAL_CODE = 'support';
const DEFAULT_SUPPORT_EMAIL = 'support@example.com';
const DEFAULT_SUPPORT_NAME = 'Suporte';
const DEFAULT_SUPPORT_LAST_NAME = 'Kunk';

function adminLoginUrl() {
  const { env } = require('../config/env');
  return `${env.publicUrls.admin}/login`;
}

/**
 * Senha aleatória que passa assertOperatorPassword (maiúscula + especial, ≥8).
 */
function generateOperatorPassword() {
  const raw = crypto.randomBytes(18).toString('base64url');
  return `K${raw}!`;
}

async function findSupportUserRow() {
  const result = await query(
    `SELECT * FROM system_users
     WHERE LOWER(TRIM(COALESCE(internal_code, ''))) = $1
     LIMIT 1`,
    [SUPPORT_INTERNAL_CODE]
  );
  return result.rows[0] || null;
}

function publicSupportUser(row) {
  if (!row) return null;
  return stripSensitive('system_users', row);
}

async function getSupportCredentials() {
  const row = await findSupportUserRow();
  return {
    default_email: DEFAULT_SUPPORT_EMAIL,
    login_url: adminLoginUrl(),
    user: publicSupportUser(row),
  };
}

async function createSupportCredentials(payload = {}) {
  const existing = await findSupportUserRow();
  if (existing) {
    throw new AppError(
      409,
      'SUPPORT_EXISTS',
      'Já existe um usuário de suporte. Remova-o antes de criar outro.'
    );
  }

  const email = String(payload.email || DEFAULT_SUPPORT_EMAIL)
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email é obrigatório');
  }

  const emailTaken = await query(
    `SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [email]
  );
  if (emailTaken.rows[0]) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário do sistema com este e-mail');
  }

  const password = generateOperatorPassword();
  authRepository.assertOperatorPassword(password);

  const user = await systemUsersService.createSystemUser({
    name: payload.name || DEFAULT_SUPPORT_NAME,
    last_name: payload.last_name || DEFAULT_SUPPORT_LAST_NAME,
    email,
    password,
    permissions: ['Administrador'],
    internal_code: SUPPORT_INTERNAL_CODE,
    status: 'active',
    user_code: uuidv4(),
    is_session_active: false,
  });

  return { user, password, email, login_url: adminLoginUrl() };
}

async function deleteSupportCredentials() {
  const existing = await findSupportUserRow();
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Nenhum usuário de suporte cadastrado');
  }
  await systemUsersService.deleteSystemUser(existing.id);
  return { deleted: true, id: existing.id };
}

module.exports = {
  SUPPORT_INTERNAL_CODE,
  DEFAULT_SUPPORT_EMAIL,
  generateOperatorPassword,
  getSupportCredentials,
  createSupportCredentials,
  deleteSupportCredentials,
};
