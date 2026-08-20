'use strict';

const { AppError } = require('../utils/response');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 250;

function parsePagination(query) {
  let limit = query.limit !== undefined ? Number(query.limit) : DEFAULT_LIMIT;
  if (Number.isNaN(limit) || limit < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'limit inválido', { limit: ['deve ser >= 1'] });
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const hasPage = query.page !== undefined && query.page !== '';
  const hasOffset = query.offset !== undefined && query.offset !== '';

  if (hasPage && hasOffset) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Use page ou offset, não ambos');
  }

  let offset = 0;
  if (hasPage) {
    const page = Number(query.page);
    if (Number.isNaN(page) || page < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page inválido');
    }
    offset = (page - 1) * limit;
  } else if (hasOffset) {
    offset = Number(query.offset);
    if (Number.isNaN(offset) || offset < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'offset inválido');
    }
  }

  return { limit, offset };
}

function parseMeta(meta) {
  if (!meta) return { filter_count: false, total_count: false };
  if (meta === '*') return { filter_count: true, total_count: true };
  const parts = String(meta).split(',').map((s) => s.trim());
  return {
    filter_count: parts.includes('filter_count'),
    total_count: parts.includes('total_count'),
  };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parsePagination, parseMeta };
