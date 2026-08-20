'use strict';

/**
 * Sample data small para instalação demo (roda dentro da API).
 * Depende de sample-data/seed.js — no Docker Compose esse diretório deve estar montado.
 */

const path = require('path');

const SMALL_COUNTS = {
  users: 12,
  institutional_clients: 2,
  professionals: 3,
  products: 5,
  tags: 4,
  orders: 8,
  services: 5,
  reception: 5,
  reports: 2,
  files: 3,
  users_files: 3,
  orders_files: 2,
  services_files: 2,
  users_api: 0,
};

function loadSeedModule() {
  const seedPath = path.join(__dirname, '../../sample-data/seed.js');
  try {
    return require(seedPath);
  } catch (err) {
    const e = new Error(
      `Não foi possível carregar sample-data/seed.js (${seedPath}). ` +
        'No Docker, monte ./kunk-api/sample-data em /app/sample-data e reinicie o container.'
    );
    e.cause = err;
    throw e;
  }
}

async function seedSmallSample() {
  const seed = loadSeedModule();
  const { buildDataset, seedDatabase } = seed;

  if (typeof buildDataset !== 'function' || typeof seedDatabase !== 'function') {
    throw new Error(
      `sample-data/seed.js incompleto (exports: ${Object.keys(seed).join(', ') || 'nenhum'}). ` +
        'Atualize o volume sample-data ou reconstrua a imagem da API.'
    );
  }

  const dataset = await buildDataset(SMALL_COUNTS);
  return seedDatabase(dataset, { truncate: false, writeFixtures: false });
}

module.exports = {
  seedSmallSample,
  SMALL_COUNTS,
};
