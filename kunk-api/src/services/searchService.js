'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { stripSensitive, quoteIdent } = require('../schema/collections');

const ENTITIES = new Set(['users', 'orders', 'services', 'reception']);

const SCOPE_COLUMNS = {
  users: new Set(),
  orders: new Set(),
  services: new Set(['professional_id']),
  reception: new Set(),
};

const SORT_WHITELIST = {
  users: [
    'created_date',
    'date_created',
    'fullname',
    'associate_name',
    'associate_last_name',
    'email_account',
    'mobile_number',
    'status',
  ],
  orders: ['created_date', 'date_created', 'associate_name', 'tracking_code', 'status', 'order_code', 'total'],
  services: ['consultation_date', 'date_created', 'associate_name', 'professional_name'],
  reception: ['date_created', 'name', 'last_name', 'email', 'phone', 'status', 'associate_name'],
};

const DEFAULT_SORT = {
  users: { field: 'created_date', dir: 'desc' },
  orders: { field: 'created_date', dir: 'desc' },
  services: { field: 'consultation_date', dir: 'desc' },
  reception: { field: 'date_created', dir: 'desc' },
};

function digitsOnly(s) {
  return String(s).replace(/\D/g, '');
}

function displayName(row) {
  if (row.fullname) return String(row.fullname).trim();
  return [row.associate_name || row.name, row.associate_last_name || row.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function applyScope(where, params, scopeFilter, entity) {
  const allowed = SCOPE_COLUMNS[entity];
  if (!scopeFilter?.field || scopeFilter.value == null || !allowed?.has(scopeFilter.field)) {
    return { where, params };
  }
  const next = [...params, scopeFilter.value];
  return {
    where: `(${where}) AND ${quoteIdent(scopeFilter.field)} = $${next.length}`,
    params: next,
  };
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(100, Math.floor(n));
}

function resolveSort(entity, sortField, sortDir) {
  const allowed = SORT_WHITELIST[entity] || [];
  const def = DEFAULT_SORT[entity];
  const field = allowed.includes(sortField) ? sortField : def.field;
  const dir = String(sortDir || def.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { field, dir };
}

async function enrichUsersGsMeta(rows) {
  if (!rows.length) return rows;
  const out = [];
  for (const row of rows) {
    const clean = stripSensitive('users', row);
    const isPatient =
      String(clean.status) === 'patient' ||
      (clean.responsible_code != null && String(clean.responsible_code).length > 0);

    let openUser = clean;
    let responsible = null;
    let patient = null;

    if (isPatient && clean.responsible_code) {
      const r = await query(`SELECT * FROM users WHERE user_code::text = $1 LIMIT 1`, [
        String(clean.responsible_code),
      ]);
      responsible = r.rows[0] ? stripSensitive('users', r.rows[0]) : null;
      patient = clean;
      openUser = responsible || clean;
    } else if (clean.patient_user_code) {
      const p = await query(`SELECT * FROM users WHERE user_code::text = $1 LIMIT 1`, [
        String(clean.patient_user_code),
      ]);
      patient = p.rows[0] ? stripSensitive('users', p.rows[0]) : null;
      responsible = clean;
    }

    const blocks = [];
    if (responsible || patient) {
      const resp = responsible || openUser;
      blocks.push({ label: 'Responsável', name: displayName(resp) });
      if (patient) blocks.push({ label: 'Paciente', name: displayName(patient) });
    }

    clean.gs_meta = {
      open_user_code: openUser.user_code,
      display_status: openUser.status,
      display_email: openUser.email_account || '',
      display_phone: openUser.mobile_number || '',
      display_created: openUser.created_date || openUser.date_created,
      display_name_blocks: blocks,
    };
    out.push(clean);
  }
  return out;
}

async function searchUsers(q, { page, limit, sortField, sortDir, scopeFilter }) {
  const t = q.trim();
  const { field, dir } = resolveSort('users', sortField, sortDir);
  const offset = (page - 1) * limit;
  let params = [];
  let where;

  if (t.includes('@')) {
    params.push(`%${t}%`);
    where = `email_account ILIKE $1`;
  } else if (digitsOnly(t).length >= 8 && !/[a-zA-Z\u00C0-\u024F]/.test(t)) {
    params.push(`%${digitsOnly(t)}%`);
    where = `mobile_number ILIKE $1`;
  } else {
    params.push(`%${t}%`);
    where = `(fullname ILIKE $1 OR associate_name ILIKE $1 OR associate_last_name ILIKE $1
      OR CONCAT(COALESCE(associate_name,''), ' ', COALESCE(associate_last_name,'')) ILIKE $1)`;
  }

  ({ where, params } = applyScope(where, params, scopeFilter, 'users'));

  const countRes = await query(`SELECT COUNT(*)::int AS n FROM users WHERE ${where}`, params);
  const total = countRes.rows[0]?.n || 0;
  params.push(limit, offset);
  const dataRes = await query(
    `SELECT * FROM users WHERE ${where}
     ORDER BY ${field} ${dir} NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const data = await enrichUsersGsMeta(dataRes.rows);
  return { data, meta: { page, limit, total } };
}

async function searchOrders(q, { page, limit, sortField, sortDir, ordersMode, scopeFilter }) {
  const t = q.trim();
  const { field, dir } = resolveSort('orders', sortField, sortDir);
  const offset = (page - 1) * limit;
  const mode = ordersMode === 'tracking' ? 'tracking' : 'name';
  let where;
  let params = [];

  if (mode === 'tracking') {
    const alnum = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    params.push(`%${alnum || t}%`);
    where = `tracking_code ILIKE $1`;
  } else {
    params.push(`%${t}%`);
    where = `(associate_name ILIKE $1 OR receiver_name ILIKE $1)`;
  }

  ({ where, params } = applyScope(where, params, scopeFilter, 'orders'));

  const countRes = await query(`SELECT COUNT(*)::int AS n FROM orders WHERE ${where}`, params);
  const total = countRes.rows[0]?.n || 0;
  params.push(limit, offset);
  const dataRes = await query(
    `SELECT id, order_code, associate_name, receiver_name, status, tracking_code,
            created_date, date_created, total
     FROM orders WHERE ${where}
     ORDER BY ${field} ${dir} NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: dataRes.rows, meta: { page, limit, total } };
}

async function searchServices(q, { page, limit, sortField, sortDir, scopeFilter }) {
  const t = q.trim();
  const { field, dir } = resolveSort('services', sortField, sortDir);
  const offset = (page - 1) * limit;
  let params = [`%${t}%`];
  let where = `(associate_name ILIKE $1 OR patient_name ILIKE $1 OR professional_name ILIKE $1)`;
  ({ where, params } = applyScope(where, params, scopeFilter, 'services'));
  const countRes = await query(`SELECT COUNT(*)::int AS n FROM services WHERE ${where}`, params);
  const total = countRes.rows[0]?.n || 0;
  params.push(limit, offset);
  const dataRes = await query(
    `SELECT id, service_code, booking_group_code, associate_name, associate_user_code,
            patient_name, patient_user_code, professional_name, status,
            consultation_date, date_created
     FROM services WHERE ${where}
     ORDER BY ${field} ${dir} NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: dataRes.rows, meta: { page, limit, total } };
}

async function searchReception(q, { page, limit, sortField, sortDir, scopeFilter }) {
  const t = q.trim();
  const { field, dir } = resolveSort('reception', sortField, sortDir);
  const offset = (page - 1) * limit;
  let params = [`%${t}%`];
  let where = `(name ILIKE $1 OR last_name ILIKE $1 OR full_name ILIKE $1 OR associate_name ILIKE $1)`;
  ({ where, params } = applyScope(where, params, scopeFilter, 'reception'));
  const countRes = await query(`SELECT COUNT(*)::int AS n FROM reception WHERE ${where}`, params);
  const total = countRes.rows[0]?.n || 0;
  params.push(limit, offset);
  const dataRes = await query(
    `SELECT id, code, name, last_name, full_name, email, phone, status,
            associate_name, associate_code, date_created
     FROM reception WHERE ${where}
     ORDER BY ${field} ${dir} NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: dataRes.rows, meta: { page, limit, total } };
}

async function globalSearch(queryParams = {}, { scopeFilter } = {}) {
  const q = String(queryParams.q || '').trim();
  if (!q) {
    throw new AppError(400, 'VALIDATION_ERROR', 'q é obrigatório');
  }
  if (q.length > 200) {
    throw new AppError(400, 'VALIDATION_ERROR', 'q muito longo');
  }

  const entity = String(queryParams.entity || 'users').toLowerCase();
  if (!ENTITIES.has(entity)) {
    throw new AppError(400, 'VALIDATION_ERROR', `entity inválida: ${entity}`);
  }

  const page = Math.max(1, Number(queryParams.page) || 1);
  const limit = clampLimit(queryParams.limit);
  const opts = {
    page,
    limit,
    sortField: queryParams.sortField,
    sortDir: queryParams.sortDir,
    ordersMode: queryParams.ordersMode,
    scopeFilter,
  };

  if (entity === 'users') return searchUsers(q, opts);
  if (entity === 'orders') return searchOrders(q, opts);
  if (entity === 'services') return searchServices(q, opts);
  return searchReception(q, opts);
}

module.exports = { globalSearch, ENTITIES };
