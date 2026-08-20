'use strict';

const { AppError } = require('../utils/response');
const { isKnownColumn, quoteIdent } = require('../schema/collections');

/**
 * @param {string} collectionName
 * @param {string|string[]} sort
 * @returns {string} ORDER BY clause without "ORDER BY"
 */
function parseSort(collectionName, sort) {
  if (!sort) return `${quoteIdent('id')} DESC`;

  const parts = Array.isArray(sort) ? sort : String(sort).split(',');
  const clauses = [];

  for (const raw of parts) {
    const token = String(raw).trim();
    if (!token) continue;
    const desc = token.startsWith('-');
    const field = desc ? token.slice(1) : token;
    if (!isKnownColumn(collectionName, field)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Sort em coluna inexistente: ${field}`);
    }
    clauses.push(`${quoteIdent(field)} ${desc ? 'DESC' : 'ASC'}`);
  }

  return clauses.length ? clauses.join(', ') : `${quoteIdent('id')} DESC`;
}

module.exports = { parseSort };
