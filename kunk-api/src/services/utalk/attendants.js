'use strict';

const { query } = require('../../db/pool');
const { AppError } = require('../../utils/response');
const { memoryCache, keys } = require('../../cache');

const TRIAGE_ROLES = ['Administrador', 'Acolhimento'];

function parsePermissions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* ignore */
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function attendantCode(row) {
  return row.user_code || row.internal_code || (row.id != null ? String(row.id) : null);
}

/** Atendentes de triagem para mapear utalk_id (sem tokens). */
async function listAttendantsForAdmin() {
  const result = await query(
    `SELECT id, name, last_name, email, user_code, internal_code, permissions, status, utalk_id
     FROM system_users
     WHERE status IS NULL OR lower(status) <> 'inactive'
     ORDER BY name ASC NULLS LAST, last_name ASC NULLS LAST
     LIMIT 300`
  );
  return result.rows
    .map((row) => {
      const permissions = parsePermissions(row.permissions);
      const code = attendantCode(row);
      return {
        id: row.id,
        code,
        user_code: row.user_code || null,
        name: [row.name, row.last_name].filter(Boolean).join(' ').trim() || code,
        email: row.email || null,
        permissions,
        utalk_id: row.utalk_id || null,
      };
    })
    .filter((u) => u.code && u.permissions.some((p) => TRIAGE_ROLES.includes(p)));
}

async function updateAttendantUtalkId(userCode, utalkId) {
  const code = String(userCode || '').trim();
  if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'userCode é obrigatório');

  const value =
    utalkId == null || String(utalkId).trim() === '' ? null : String(utalkId).trim();

  const result = await query(
    `UPDATE system_users
     SET utalk_id = $1, date_updated = NOW()
     WHERE user_code::text = $2 OR internal_code::text = $2
     RETURNING id, user_code, internal_code, utalk_id, name, last_name, email, permissions`,
    [value, code]
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Operador não encontrado');

  memoryCache.invalidate(keys.ATTENDANTS);

  const permissions = parsePermissions(row.permissions);
  return {
    id: row.id,
    code: attendantCode(row),
    user_code: row.user_code || null,
    name: [row.name, row.last_name].filter(Boolean).join(' ').trim() || attendantCode(row),
    email: row.email || null,
    permissions,
    utalk_id: row.utalk_id || null,
  };
}

/** Resolve utalk_id de um operador pelo user_code / internal_code. */
async function resolveUtalkIdByCode(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  const result = await query(
    `SELECT utalk_id FROM system_users
     WHERE user_code::text = $1 OR internal_code::text = $1
     LIMIT 1`,
    [c]
  );
  const raw = result.rows[0]?.utalk_id;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

module.exports = {
  listAttendantsForAdmin,
  updateAttendantUtalkId,
  resolveUtalkIdByCode,
  TRIAGE_ROLES,
};
