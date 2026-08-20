'use strict';

const { AppError } = require('../utils/response');
const { isKnownColumn, quoteIdent } = require('../schema/collections');

const OPERATORS = new Set([
  '_eq', '_neq', '_in', '_nin', '_null', '_nnull',
  '_lt', '_lte', '_gt', '_gte',
  '_contains', '_icontains', '_starts_with', '_istarts_with',
  '_between', '_and', '_or',
]);

function parseFilterQuery(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'filter JSON inválido');
    }
  }
  return raw;
}

/**
 * Converte filter da API Kunk em SQL parametrizado.
 * @returns {{ sql: string, params: any[] }}
 */
function buildFilterSql(collectionName, filter, startIndex = 1) {
  if (!filter || Object.keys(filter).length === 0) {
    return { sql: '', params: [] };
  }

  const params = [];
  let idx = startIndex;

  function nextParam(value) {
    params.push(value);
    return `$${idx++}`;
  }

  function col(name) {
    if (!isKnownColumn(collectionName, name)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Campo de filter inválido: ${name}`);
    }
    return quoteIdent(name);
  }

  function compile(node) {
    if (!node || typeof node !== 'object') {
      throw new AppError(400, 'VALIDATION_ERROR', 'filter inválido');
    }

    if (node._and) {
      const parts = node._and.map(compile).filter(Boolean);
      return parts.length ? `(${parts.join(' AND ')})` : '';
    }
    if (node._or) {
      const parts = node._or.map(compile).filter(Boolean);
      return parts.length ? `(${parts.join(' OR ')})` : '';
    }

    const parts = [];
    for (const [key, value] of Object.entries(node)) {
      if (key === '_and' || key === '_or') continue;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [op, opVal] of Object.entries(value)) {
          if (!OPERATORS.has(op)) {
            throw new AppError(400, 'VALIDATION_ERROR', `Operador não suportado: ${op}`);
          }
          parts.push(compileOp(col(key), op, opVal));
        }
      } else {
        // shorthand equality
        parts.push(`${col(key)} = ${nextParam(value)}`);
      }
    }
    return parts.length ? `(${parts.join(' AND ')})` : '';
  }

  function compileOp(column, op, opVal) {
    switch (op) {
      case '_eq':
        return `${column} = ${nextParam(opVal)}`;
      case '_neq':
        return `${column} <> ${nextParam(opVal)}`;
      case '_lt':
        return `${column} < ${nextParam(opVal)}`;
      case '_lte':
        return `${column} <= ${nextParam(opVal)}`;
      case '_gt':
        return `${column} > ${nextParam(opVal)}`;
      case '_gte':
        return `${column} >= ${nextParam(opVal)}`;
      case '_null':
        return opVal ? `${column} IS NULL` : `${column} IS NOT NULL`;
      case '_nnull':
        return opVal ? `${column} IS NOT NULL` : `${column} IS NULL`;
      case '_in': {
        const list = Array.isArray(opVal) ? opVal : [opVal];
        if (!list.length) return 'FALSE';
        const ph = list.map((v) => nextParam(v)).join(', ');
        return `${column} IN (${ph})`;
      }
      case '_nin': {
        const list = Array.isArray(opVal) ? opVal : [opVal];
        if (!list.length) return 'TRUE';
        const ph = list.map((v) => nextParam(v)).join(', ');
        return `${column} NOT IN (${ph})`;
      }
      case '_contains':
        return `${column}::text LIKE ${nextParam(`%${opVal}%`)}`;
      case '_icontains':
        return `${column}::text ILIKE ${nextParam(`%${opVal}%`)}`;
      case '_starts_with':
        return `${column}::text LIKE ${nextParam(`${opVal}%`)}`;
      case '_istarts_with':
        return `${column}::text ILIKE ${nextParam(`${opVal}%`)}`;
      case '_between': {
        const [a, b] = Array.isArray(opVal) ? opVal : [];
        if (a === undefined || b === undefined) {
          throw new AppError(400, 'VALIDATION_ERROR', '_between requer [min, max]');
        }
        return `${column} BETWEEN ${nextParam(a)} AND ${nextParam(b)}`;
      }
      default:
        throw new AppError(400, 'VALIDATION_ERROR', `Operador não suportado: ${op}`);
    }
  }

  const sql = compile(filter);
  return { sql, params };
}

module.exports = { OPERATORS, parseFilterQuery, buildFilterSql };
