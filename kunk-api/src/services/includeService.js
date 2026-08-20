'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { getRelation, listIncludeKeys } = require('../schema/relations');
const { stripSensitive, quoteIdent, getCollection } = require('../schema/collections');

function parseInclude(collection, includeRaw) {
  if (includeRaw === undefined || includeRaw === null || includeRaw === '') {
    return [];
  }
  const allowed = new Set(listIncludeKeys(collection));
  const keys = String(includeRaw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `include inválido: ${key}. Permitidos: ${[...allowed].join(', ') || '(nenhum)'}`
      );
    }
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** Flag de query: presente (`?patients` ou `?patients=`) = true; ausente = false. */
function truthyParam(value) {
  if (value === undefined || value === null) return false;
  if (value === false || value === 0) return false;
  const s = String(value).toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  return true;
}

function keyStr(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

async function loadByKeys(targetCollection, targetKey, keys) {
  const unique = [...new Set(keys.map(keyStr).filter(Boolean))];
  if (!unique.length) return new Map();

  const collection = getCollection(targetCollection);
  if (!collection) {
    throw new AppError(500, 'INTERNAL', `Collection alvo inválida: ${targetCollection}`);
  }

  const cols = collection.columns
    .filter((c) => !collection.sensitive.includes(c))
    .map((c) => quoteIdent(c))
    .join(', ');

  const result = await query(
    `SELECT ${cols} FROM ${quoteIdent(targetCollection)}
     WHERE ${quoteIdent(targetKey)} = ANY($1::uuid[])`,
    [unique]
  );

  const map = new Map();
  for (const row of result.rows) {
    const k = keyStr(row[targetKey]);
    if (k) map.set(k, stripSensitive(targetCollection, row));
  }
  return map;
}

/**
 * Embute relações 1:1 definidas em relations.js.
 * @param {string} collection
 * @param {object[]} rows
 * @param {string[]} includeKeys
 */
async function hydrateIncludes(collection, rows, includeKeys) {
  if (!rows?.length || !includeKeys?.length) return rows;

  for (const includeKey of includeKeys) {
    const rel = getRelation(collection, includeKey);
    if (!rel) continue;

    const keys = rows.map((r) => r[rel.localField]);
    const map = await loadByKeys(rel.targetCollection, rel.targetKey, keys);

    for (const row of rows) {
      const k = keyStr(row[rel.localField]);
      row[rel.embedAs] = k ? map.get(k) || null : null;
    }
  }

  return rows;
}

/**
 * Embute array `patients` (users.responsible_code = user.user_code).
 */
async function hydratePatients(rows) {
  if (!rows?.length) return rows;

  const associateCodes = rows
    .filter((r) => !r.responsible_code)
    .map((r) => keyStr(r.user_code))
    .filter(Boolean);

  const patientsByResponsible = new Map();
  if (associateCodes.length) {
    const collection = getCollection('users');
    const cols = collection.columns
      .filter((c) => !collection.sensitive.includes(c))
      .map((c) => quoteIdent(c))
      .join(', ');

    const result = await query(
      `SELECT ${cols} FROM users
       WHERE responsible_code = ANY($1::uuid[])
       ORDER BY id DESC`,
      [associateCodes]
    );

    for (const patient of result.rows) {
      const cleaned = stripSensitive('users', patient);
      const rk = keyStr(cleaned.responsible_code);
      if (!rk) continue;
      if (!patientsByResponsible.has(rk)) patientsByResponsible.set(rk, []);
      patientsByResponsible.get(rk).push(cleaned);
    }
  }

  for (const row of rows) {
    if (row.responsible_code) {
      row.patients = [];
    } else {
      row.patients = patientsByResponsible.get(keyStr(row.user_code)) || [];
    }
  }

  return rows;
}

module.exports = {
  parseInclude,
  truthyParam,
  hydrateIncludes,
  hydratePatients,
};
