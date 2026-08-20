'use strict';

const { AppError } = require('../utils/response');
const { getCollection, quoteIdent } = require('../schema/collections');

/**
 * @returns {string[]} column names to select (without sensitive)
 */
function parseFields(collectionName, fields) {
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new AppError(404, 'UNKNOWN_COLLECTION', `Collection desconhecida: ${collectionName}`);
  }

  const allowed = collection.columns.filter((c) => !collection.sensitive.includes(c));

  if (!fields || fields === '*') {
    return allowed;
  }

  const requested = String(fields)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const field of requested) {
    if (field.includes('.')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Relações em fields ainda não suportadas');
    }
    if (!collection.columns.includes(field)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Campo inválido: ${field}`);
    }
    if (collection.sensitive.includes(field)) {
      continue;
    }
    out.push(field);
  }

  return out.length ? out : allowed;
}

function fieldsToSql(fieldList) {
  return fieldList.map((f) => quoteIdent(f)).join(', ');
}

module.exports = { parseFields, fieldsToSql };
