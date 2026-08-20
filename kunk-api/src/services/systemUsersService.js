'use strict';

const itemsRepository = require('../repositories/itemsRepository');
const authRepository = require('../repositories/authRepository');
const { stripSensitive } = require('../schema/collections');
const { parseRoles } = require('../schema/rbac');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { memoryCache, keys } = require('../cache');

function invalidateAttendantsCache() {
  memoryCache.invalidate(keys.ATTENDANTS);
}

const PORTAL_ROLE = 'Profissional';

async function assertOperatorPermissions(permissions, internalCode) {
  const roles = parseRoles(permissions).filter(Boolean);
  if (roles.includes('Prescritor')) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Papel Prescritor não é usado para login. Use Profissional para o relatório de atendimentos.'
    );
  }
  if (!roles.includes(PORTAL_ROLE)) return;
  if (roles.length !== 1) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'A permissão Profissional não pode ser combinada com outras'
    );
  }
  const code = String(internalCode || '').trim();
  if (!code) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Selecione um profissional para o acesso ao relatório de atendimentos'
    );
  }
  const found = await query(
    `SELECT id FROM professionals WHERE professional_code::text = $1 LIMIT 1`,
    [code]
  );
  if (!found.rows[0]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profissional não encontrado para o código interno');
  }
}

function normalizePermissions(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      /* keep as-is */
    }
    return value;
  }
  return JSON.stringify(value);
}

function hasAdminRole(permissions) {
  return parseRoles(permissions).includes('Administrador');
}

async function countActiveAdmins(excludeId = null) {
  const result = await query(
    `SELECT id, permissions, status FROM system_users
     WHERE ($1::int IS NULL OR id <> $1)`,
    [excludeId]
  );
  return result.rows.filter((row) => {
    const status = String(row.status || '').toLowerCase();
    const active = !status || status === 'active' || status === 'ativo';
    return active && hasAdminRole(row.permissions);
  }).length;
}

async function assertNotLastAdmin(existing, nextPermissions, nextStatus) {
  if (!hasAdminRole(existing.permissions)) return;

  const status = nextStatus !== undefined ? nextStatus : existing.status;
  const statusLower = String(status || '').toLowerCase();
  const willBeActive = !statusLower || statusLower === 'active' || statusLower === 'ativo';
  const perms = nextPermissions !== undefined ? nextPermissions : existing.permissions;
  const willRemainAdmin = willBeActive && hasAdminRole(perms);

  if (willRemainAdmin) return;

  const others = await countActiveAdmins(existing.id);
  if (others < 1) {
    throw new AppError(409, 'LAST_ADMIN', 'Não é possível remover ou desativar o último Administrador');
  }
}

async function listSystemUsers() {
  const { data } = await itemsRepository.listItems('system_users', { limit: 100 });
  return data;
}

async function getSystemUser(id) {
  const row = await itemsRepository.getItem('system_users', id);
  return stripSensitive('system_users', row);
}

async function createSystemUser(payload) {
  const body = { ...payload };
  if (body.password) {
    authRepository.assertOperatorPassword(body.password);
    body.password = await authRepository.hashPassword(body.password);
  }
  if (body.permissions !== undefined) {
    await assertOperatorPermissions(body.permissions, body.internal_code);
    body.permissions = normalizePermissions(body.permissions);
  }
  const created = await itemsRepository.createItem('system_users', body);
  invalidateAttendantsCache();
  return stripSensitive('system_users', created);
}

async function updateSystemUser(id, payload) {
  const existing = await itemsRepository.getItem('system_users', id);
  const body = { ...payload };
  delete body.id;
  delete body.session_token;
  delete body.session_expires;
  delete body.is_session_active;

  if (body.password !== undefined && body.password !== null && body.password !== '') {
    authRepository.assertOperatorPassword(body.password);
    body.password = await authRepository.hashPassword(body.password);
  } else {
    delete body.password;
  }

  const nextCode = body.internal_code !== undefined ? body.internal_code : existing.internal_code;
  if (body.permissions !== undefined) {
    await assertOperatorPermissions(body.permissions, nextCode);
    body.permissions = normalizePermissions(body.permissions);
  } else if (parseRoles(existing.permissions).includes(PORTAL_ROLE)) {
    await assertOperatorPermissions(existing.permissions, nextCode);
  }

  await assertNotLastAdmin(existing, body.permissions, body.status);

  const updated = await itemsRepository.updateItem('system_users', id, body);
  invalidateAttendantsCache();
  return stripSensitive('system_users', updated);
}

async function deleteSystemUser(id) {
  const existing = await itemsRepository.getItem('system_users', id);
  await assertNotLastAdmin(existing, '[]', 'inactive');
  await itemsRepository.deleteItem('system_users', id);
  invalidateAttendantsCache();
  return { id: Number(id) };
}

module.exports = {
  listSystemUsers,
  getSystemUser,
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  assertOperatorPermissions,
};
