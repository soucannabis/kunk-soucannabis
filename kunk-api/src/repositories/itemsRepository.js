'use strict';

const { query } = require('../db/pool');
const { getCollection, quoteIdent, stripSensitive } = require('../schema/collections');
const { AppError } = require('../utils/response');
const { parseFilterQuery, buildFilterSql } = require('../query/parseFilter');
const { parseSort } = require('../query/parseSort');
const { parseFields, fieldsToSql } = require('../query/parseFields');
const { parsePagination, parseMeta } = require('../query/parsePagination');

async function listItems(collectionName, queryParams, { scopeFilter } = {}) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  const fields = parseFields(collectionName, queryParams.fields);
  const selectSql = fieldsToSql(fields);
  const { limit, offset } = parsePagination(queryParams);
  const orderSql = parseSort(collectionName, queryParams.sort);
  const metaFlags = parseMeta(queryParams.meta);

  let filter = parseFilterQuery(queryParams.filter);
  if (scopeFilter) {
    const scoped = { [scopeFilter.field]: { _eq: scopeFilter.value } };
    filter = filter ? { _and: [filter, scoped] } : scoped;
  }

  if (queryParams.search && collection.searchable.length) {
    const searchOr = {
      _or: collection.searchable.map((field) => ({
        [field]: { _icontains: queryParams.search },
      })),
    };
    filter = filter ? { _and: [filter, searchOr] } : searchOr;
  }

  const { sql: whereSql, params } = buildFilterSql(collectionName, filter, 1);
  const whereClause = whereSql ? `WHERE ${whereSql}` : '';

  const listParams = [...params, limit, offset];
  const limitPh = `$${params.length + 1}`;
  const offsetPh = `$${params.length + 2}`;

  const listResult = await query(
    `SELECT ${selectSql} FROM ${quoteIdent(collectionName)} ${whereClause} ORDER BY ${orderSql} LIMIT ${limitPh} OFFSET ${offsetPh}`,
    listParams
  );

  const data = listResult.rows.map((row) => stripSensitive(collectionName, row));

  let meta = null;
  if (metaFlags.filter_count || metaFlags.total_count) {
    meta = {};
    if (metaFlags.filter_count) {
      const countResult = await query(
        `SELECT COUNT(*)::int AS c FROM ${quoteIdent(collectionName)} ${whereClause}`,
        params
      );
      meta.filter_count = countResult.rows[0].c;
    }
    if (metaFlags.total_count) {
      const totalResult = await query(
        `SELECT COUNT(*)::int AS c FROM ${quoteIdent(collectionName)}`
      );
      meta.total_count = totalResult.rows[0].c;
    }
  }

  return { data, meta };
}

async function getItem(collectionName, id, queryParams = {}, { scopeFilter } = {}) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  const fields = parseFields(collectionName, queryParams.fields);
  const selectSql = fieldsToSql(fields);
  const pk = quoteIdent(collection.pk.name);

  const params = [id];
  let where = `${pk} = $1`;
  if (scopeFilter) {
    params.push(scopeFilter.value);
    where += ` AND ${quoteIdent(scopeFilter.field)} = $2`;
  }

  const result = await query(
    `SELECT ${selectSql} FROM ${quoteIdent(collectionName)} WHERE ${where} LIMIT 1`,
    params
  );

  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado');
  }

  return stripSensitive(collectionName, result.rows[0]);
}

function sanitizeWritePayload(collectionName, payload, { isCreate, skipReadonly } = {}) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  const skip = new Set(Array.isArray(skipReadonly) ? skipReadonly : []);
  const unknown = [];
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!collection.columns.includes(key)) {
      unknown.push(key);
      continue;
    }
    const createUuidPk = isCreate && collection.pk.type === 'uuid' && key === 'id';
    const alwaysReadonly = collection.readonly.includes(key) && !createUuidPk;
    const updateReadonly = !isCreate && (collection.readonlyOnUpdate || []).includes(key);
    if ((alwaysReadonly || updateReadonly) && !skip.has(key)) {
      if (key === collection.pk.name) continue;
      continue;
    }
    if (collection.sensitive.includes(key)) {
      continue;
    }
    if (value === undefined) continue;
    out[key] = value;
  }

  if (unknown.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Campos desconhecidos no payload', {
      unknown_fields: unknown,
    });
  }

  return out;
}

async function createItem(collectionName, payload) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  const data = sanitizeWritePayload(collectionName, payload, { isCreate: true });
  if (collection.pk.type === 'uuid' && !data[collection.pk.name]) {
    const { v4: uuidv4 } = require('uuid');
    data[collection.pk.name] = uuidv4();
  }
  if (collection.columns.includes('date_created') && data.date_created === undefined) {
    data.date_created = new Date().toISOString();
  }
  if (collectionName === 'files' && data.created_at === undefined) {
    data.created_at = new Date().toISOString();
  }

  const keys = Object.keys(data);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payload vazio');
  }

  const cols = keys.map((k) => quoteIdent(k)).join(', ');
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
  // Serialize JSON/JSONB-ish values: node-pg treats JS arrays as PG arrays
  const values = keys.map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });

  const result = await query(
    `INSERT INTO ${quoteIdent(collectionName)} (${cols}) VALUES (${ph}) RETURNING *`,
    values
  );

  const row = stripSensitive(collectionName, result.rows[0]);
  try {
    const { isWebhookTable } = require('../services/webhooks/catalog');
    if (isWebhookTable(collectionName)) {
      const { emitWebhookSafe } = require('../services/webhooks/emit');
      const pk = collection.pk.name;
      emitWebhookSafe({
        table: collectionName,
        action: 'create',
        recordId: row?.[pk],
        data: row,
      });
    }
  } catch {
    /* fail-soft */
  }
  return row;
}

async function updateItem(collectionName, id, payload, { scopeFilter, skipReadonly } = {}) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  let before = null;
  try {
    const { isWebhookTable } = require('../services/webhooks/catalog');
    if (isWebhookTable(collectionName)) {
      before = await getItem(collectionName, id, {}, { scopeFilter });
    }
  } catch {
    before = null;
  }

  const data = sanitizeWritePayload(collectionName, payload, { isCreate: false, skipReadonly });
  if (collection.columns.includes('date_updated')) {
    data.date_updated = new Date().toISOString();
  }

  const keys = Object.keys(data);
  if (!keys.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payload vazio');
  }

  const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(', ');
  const values = keys.map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  values.push(id);

  let where = `${quoteIdent(collection.pk.name)} = $${values.length}`;
  if (scopeFilter) {
    values.push(scopeFilter.value);
    where += ` AND ${quoteIdent(scopeFilter.field)} = $${values.length}`;
  }

  const result = await query(
    `UPDATE ${quoteIdent(collectionName)} SET ${sets} WHERE ${where} RETURNING *`,
    values
  );

  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado');
  }

  const row = stripSensitive(collectionName, result.rows[0]);
  try {
    const { isWebhookTable } = require('../services/webhooks/catalog');
    if (isWebhookTable(collectionName)) {
      const { emitWebhookSafe } = require('../services/webhooks/emit');
      const { diffChangedFields, hasMeaningfulChanges } = require('../services/webhooks/diff');
      const pk = collection.pk.name;
      const changed = diffChangedFields(before, row, { alwaysInclude: [pk] });
      if (hasMeaningfulChanges(changed, [pk])) {
        emitWebhookSafe({
          table: collectionName,
          action: 'update',
          recordId: row?.[pk],
          data: changed,
        });
      }
    }
  } catch {
    /* fail-soft */
  }
  return row;
}

async function deleteItem(collectionName, id, { scopeFilter } = {}) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  let before = null;
  try {
    const { isWebhookTable } = require('../services/webhooks/catalog');
    if (isWebhookTable(collectionName)) {
      before = await getItem(collectionName, id, {}, { scopeFilter });
    }
  } catch {
    before = null;
  }

  const values = [id];
  let where = `${quoteIdent(collection.pk.name)} = $1`;
  if (scopeFilter) {
    values.push(scopeFilter.value);
    where += ` AND ${quoteIdent(scopeFilter.field)} = $2`;
  }

  const result = await query(
    `DELETE FROM ${quoteIdent(collectionName)} WHERE ${where} RETURNING ${quoteIdent(collection.pk.name)}`,
    values
  );

  if (!result.rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado');
  }

  const deletedId = result.rows[0][collection.pk.name];
  try {
    const { isWebhookTable } = require('../services/webhooks/catalog');
    if (isWebhookTable(collectionName)) {
      const { emitWebhookSafe } = require('../services/webhooks/emit');
      emitWebhookSafe({
        table: collectionName,
        action: 'delete',
        recordId: deletedId,
        data: before || { [collection.pk.name]: deletedId },
      });
    }
  } catch {
    /* fail-soft */
  }

  return { id: deletedId };
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  sanitizeWritePayload,
};
