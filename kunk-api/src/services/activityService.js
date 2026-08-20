'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');

function actorCode(actor) {
  if (!actor) return null;
  return actor.user_code || actor.internal_code || (actor.id != null ? String(actor.id) : null);
}

function actorDisplayName(actor) {
  if (!actor) return 'Sistema';
  const name = [actor.name, actor.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return actor.email || actorCode(actor) || 'Sistema';
}

function contactLabel(row) {
  if (!row) return 'contato';
  const name = row.full_name
    || [row.name, row.last_name].filter(Boolean).join(' ').trim()
    || row.associate_name
    || row.email
    || `#${row.id}`;
  return name;
}

/**
 * Persist an activity row. Fail-soft: never throws to callers of recordSafe.
 */
async function record(payload) {
  const entityType = String(payload.entity_type || '').trim();
  const entityId = String(payload.entity_id ?? '').trim();
  const action = String(payload.action || '').trim();
  const summary = String(payload.summary || '').trim();
  if (!entityType || !entityId || !action || !summary) {
    throw new AppError(400, 'VALIDATION_ERROR', 'entity_type, entity_id, action e summary são obrigatórios');
  }

  const metadata = payload.metadata == null ? null : payload.metadata;
  const result = await query(
    `INSERT INTO system_activity (
       entity_type, entity_id, entity_code, action,
       actor_user_code, actor_name, related_user_code, related_user_name,
       summary, metadata, read_by, date_created
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb, NOW())
     RETURNING *`,
    [
      entityType,
      entityId,
      payload.entity_code || null,
      action,
      payload.actor_user_code || null,
      payload.actor_name || null,
      payload.related_user_code || null,
      payload.related_user_name || null,
      summary,
      metadata == null ? null : JSON.stringify(metadata),
    ],
  );
  return result.rows[0];
}

async function recordSafe(payload) {
  try {
    return await record(payload);
  } catch (err) {
    console.error('[activityService.recordSafe]', err.message || err);
    return null;
  }
}

function fromActor(actor) {
  return {
    actor_user_code: actorCode(actor),
    actor_name: actorDisplayName(actor),
  };
}

function relatedFrom({ code, name }) {
  return {
    related_user_code: code || null,
    related_user_name: name || null,
  };
}

async function resolveAttendantName(code) {
  if (!code) return null;
  const result = await query(
    `SELECT name, last_name, email, user_code, internal_code
     FROM system_users
     WHERE user_code::text = $1 OR internal_code::text = $1 OR id::text = $1
     LIMIT 1`,
    [String(code)],
  );
  const row = result.rows[0];
  if (!row) return String(code);
  return [row.name, row.last_name].filter(Boolean).join(' ').trim() || row.email || code;
}

async function list({
  limit = 50,
  offset = 0,
  entity_type,
  actor_user_code,
  action,
  from,
  to,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const clauses = [];
  const params = [];

  if (entity_type) {
    params.push(String(entity_type));
    clauses.push(`entity_type = $${params.length}`);
  }
  if (actor_user_code) {
    params.push(String(actor_user_code));
    clauses.push(`actor_user_code = $${params.length}`);
  }
  if (action) {
    params.push(String(action));
    clauses.push(`action = $${params.length}`);
  }
  if (from) {
    params.push(new Date(from).toISOString());
    clauses.push(`date_created >= $${params.length}`);
  }
  if (to) {
    params.push(new Date(to).toISOString());
    clauses.push(`date_created <= $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(lim, off);

  const listResult = await query(
    `SELECT * FROM system_activity
     ${where}
     ORDER BY date_created DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const countParams = params.slice(0, -2);
  const countResult = await query(
    `SELECT COUNT(*)::int AS c FROM system_activity ${where}`,
    countParams,
  );

  return {
    data: listResult.rows,
    meta: { filter_count: countResult.rows[0].c, limit: lim, offset: off },
  };
}

async function listMine(userCode, { limit = 50, offset = 0, unread_only = false } = {}) {
  const code = String(userCode || '').trim();
  if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'usuário sem código');

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const clauses = [
    `related_user_code = $1`,
    `(actor_user_code IS NULL OR actor_user_code <> $1)`,
  ];
  const params = [code];

  if (unread_only) {
    clauses.push(`NOT (read_by ? $1)`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  params.push(lim, off);

  const listResult = await query(
    `SELECT * FROM system_activity
     ${where}
     ORDER BY date_created DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { data: listResult.rows, meta: { limit: lim, offset: off } };
}

async function unreadCount(userCode) {
  const code = String(userCode || '').trim();
  if (!code) return 0;
  const result = await query(
    `SELECT COUNT(*)::int AS c
     FROM system_activity
     WHERE related_user_code = $1
       AND (actor_user_code IS NULL OR actor_user_code <> $1)
       AND NOT (read_by ? $1)`,
    [code],
  );
  return result.rows[0].c;
}

async function markRead(userCode, { ids, all = false } = {}) {
  const code = String(userCode || '').trim();
  if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'usuário sem código');

  if (all) {
    await query(
      `UPDATE system_activity
       SET read_by = CASE
         WHEN read_by ? $1 THEN read_by
         ELSE read_by || to_jsonb($1::text)
       END
       WHERE related_user_code = $1
         AND NOT (read_by ? $1)`,
      [code],
    );
    return { updated: true };
  }

  const idList = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
  if (!idList.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ids ou all são obrigatórios');
  }

  await query(
    `UPDATE system_activity
     SET read_by = CASE
       WHEN read_by ? $1 THEN read_by
       ELSE read_by || to_jsonb($1::text)
     END
     WHERE id = ANY($2::int[])
       AND related_user_code = $1`,
    [code, idList],
  );
  return { updated: true };
}

module.exports = {
  record,
  recordSafe,
  fromActor,
  relatedFrom,
  actorCode,
  actorDisplayName,
  contactLabel,
  resolveAttendantName,
  list,
  listMine,
  unreadCount,
  markRead,
};
