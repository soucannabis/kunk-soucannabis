'use strict';

const itemsRepository = require('../repositories/itemsRepository');
const { AppError } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');

async function saveReport(payload, actor) {
  return itemsRepository.createItem('reports', {
    ...payload,
    report_code: payload.report_code || uuidv4(),
    date_created: new Date().toISOString(),
    created_by: payload.created_by || actor?.email || String(actor?.id),
  });
}

async function runReport(id) {
  const report = await itemsRepository.getItem('reports', id);
  // Sandboxed: never execute arbitrary sql_query — return config only
  if (report.sql_query) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Execução de sql_query arbitrário não é permitida; use query_config'
    );
  }
  return {
    report_id: report.id,
    name: report.name,
    query_config: report.query_config,
    result: [],
    message: 'Run sandboxed: retorna definição sem executar SQL livre',
  };
}

async function toggleFavorite(id, userKey) {
  const report = await itemsRepository.getItem('reports', id);
  let favorites = [];
  if (Array.isArray(report.favorites)) {
    favorites = [...report.favorites];
  } else if (report.favorites && typeof report.favorites === 'object') {
    favorites = Array.isArray(report.favorites.users) ? [...report.favorites.users] : [];
  }
  const key = String(userKey);
  if (favorites.includes(key)) {
    favorites = favorites.filter((f) => f !== key);
  } else {
    favorites.push(key);
  }
  // Store as object so node-pg sends JSONB (plain arrays become PG arrays)
  return itemsRepository.updateItem('reports', id, { favorites: { users: favorites } });
}

module.exports = { saveReport, runReport, toggleFavorite };
