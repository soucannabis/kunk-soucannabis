'use strict';

const { query } = require('../db/pool');
const itemsRepository = require('../repositories/itemsRepository');
const { stripSensitive, quoteIdent } = require('../schema/collections');
const { AppError } = require('../utils/response');
const { portalProfessionalDeniedFields } = require('../schema/rbac');
const { isCollaboratorTrue, isPrescriberTrue, normalizeFlagForWrite } = require('../utils/professionalFlags');
const { v4: uuidv4 } = require('uuid');
const professionalTypesConfig = require('./professionalTypesConfig');

function flagSqlMatch(column, wantTrue) {
  const expr = `LOWER(TRIM(COALESCE(${column}::text, '')))`;
  if (wantTrue) {
    return `(${expr} IN ('true', '1', 'sim', 'yes'))`;
  }
  return `(${expr} NOT IN ('true', '1', 'sim', 'yes') OR ${column} IS NULL)`;
}

async function list(filters = {}, { scopeFilter } = {}) {
  const params = [];
  const where = [];

  if (scopeFilter?.field && scopeFilter?.value != null) {
    params.push(scopeFilter.value);
    where.push(`${quoteIdent(scopeFilter.field)} = $${params.length}`);
  }

  if (filters.active !== undefined && filters.active !== '') {
    params.push(Number(filters.active));
    where.push(`active = $${params.length}`);
  }

  if (filters.type) {
    params.push(String(filters.type));
    where.push(`type = $${params.length}`);
  }

  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(
      `(name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR email ILIKE $${params.length})`
    );
  }

  const role = filters.role || filters.papel;
  if (role === 'collaborators' || filters.is_collaborator === 'true' || filters.is_collaborator === true) {
    where.push(flagSqlMatch('is_collaborator', true));
  } else if (role === 'prescribers' || filters.is_prescriber === 'true' || filters.is_prescriber === true) {
    where.push(flagSqlMatch('is_prescriber', true));
  } else if (role === 'both') {
    where.push(`(${flagSqlMatch('is_collaborator', true)} AND ${flagSqlMatch('is_prescriber', true)})`);
  } else if (filters.is_collaborator === 'false' || filters.is_collaborator === false) {
    where.push(flagSqlMatch('is_collaborator', false));
  } else if (filters.is_prescriber === 'false' || filters.is_prescriber === false) {
    where.push(flagSqlMatch('is_prescriber', false));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM professionals ${whereSql} ORDER BY name ASC NULLS LAST, id DESC LIMIT 500`,
    params
  );
  let rows = result.rows.map((r) => stripSensitive('professionals', r));

  if (filters.enrich_calendar === 'true' || filters.enrich_calendar === true) {
    rows = await enrichCalendars(rows);
  }

  return rows;
}

async function enrichCalendars(rows) {
  if (!(await require('./moduleFlags').isModuleEnabled('google_calendar'))) {
    return rows.map((r) => ({ ...r, calendar: null }));
  }
  try {
    const calendars = require('./google_calendar/calendars');
    const listCal = await calendars.listCalendars();
    const byId = Object.fromEntries(listCal.map((c) => [c.id, c]));
    return rows.map((r) => ({
      ...r,
      calendar: r.calendar_id ? byId[r.calendar_id] || { id: r.calendar_id, summary: r.calendar_id } : null,
    }));
  } catch {
    return rows.map((r) => ({
      ...r,
      calendar: r.calendar_id ? { id: r.calendar_id, summary: r.calendar_id } : null,
    }));
  }
}

async function getById(id, { scopeFilter } = {}) {
  const params = [id];
  let sql = `SELECT * FROM professionals WHERE id = $1`;
  if (scopeFilter?.field && scopeFilter?.value != null) {
    params.push(scopeFilter.value);
    sql += ` AND ${quoteIdent(scopeFilter.field)} = $2`;
  }
  const result = await query(`${sql} LIMIT 1`, params);
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Profissional não encontrado');
  const [enriched] = await enrichCalendars([stripSensitive('professionals', row)]);
  return enriched;
}

function normalizePayload(payload = {}) {
  const body = { ...payload };
  if (body.is_collaborator !== undefined) {
    body.is_collaborator = normalizeFlagForWrite(body.is_collaborator) ? 'true' : 'false';
  }
  if (body.is_prescriber !== undefined) {
    body.is_prescriber = normalizeFlagForWrite(body.is_prescriber) ? 'true' : 'false';
  }
  if (body.active !== undefined) {
    body.active = Number(body.active) ? 1 : 0;
  }
  if (body.consultation_price !== undefined) {
    if (body.consultation_price === null || body.consultation_price === '') {
      body.consultation_price = 0;
    } else {
      body.consultation_price = Number(body.consultation_price) || 0;
    }
  }
  return body;
}

async function create(payload) {
  const body = normalizePayload(payload);
  if (!body.name) throw new AppError(400, 'VALIDATION_ERROR', 'name obrigatório');
  body.type = await professionalTypesConfig.assertValidProfessionalType(body.type);
  if (body.consultation_price === undefined) body.consultation_price = 0;
  return itemsRepository.createItem('professionals', {
    ...body,
    professional_code: body.professional_code || uuidv4(),
    date_created: new Date().toISOString(),
    active: body.active != null ? body.active : 1,
  });
}

async function update(id, payload, { scopeFilter, roles } = {}) {
  const denied = portalProfessionalDeniedFields(roles, payload || {});
  if (denied.length) {
    throw new AppError(403, 'FORBIDDEN', 'Sem permissão para alterar estes campos');
  }
  const body = normalizePayload(payload);
  if (body.type !== undefined) {
    body.type = await professionalTypesConfig.assertValidProfessionalType(body.type);
  }
  return itemsRepository.updateItem('professionals', id, body, { scopeFilter });
}

async function softDelete(id) {
  return itemsRepository.updateItem('professionals', id, { active: 0 });
}

async function updateDonationBalance(id, donationBalance) {
  if (donationBalance === undefined || Number.isNaN(Number(donationBalance))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'donation_balance inválido');
  }
  return itemsRepository.updateItem('professionals', id, {
    donation_balance: Number(donationBalance),
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  softDelete,
  updateDonationBalance,
  isCollaboratorTrue,
  isPrescriberTrue,
};
