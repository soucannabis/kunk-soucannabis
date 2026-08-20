'use strict';

const { withClient } = require('../db/pool');
const { AppError } = require('../utils/response');
const { getDriverForFile } = require('../storage');

/** Tabelas do seed de negócio (ordem de exclusão: filhos → pais). */
const SAMPLE_TABLES = [
  'orders_files',
  'services_files',
  'users_files',
  'orders',
  'services',
  'reception',
  'reports',
  'tags',
  'products',
  'institutional_clients',
  'professionals',
  'users_api',
  'users',
  'system_users',
  'files',
];

const TABLE_LABELS = {
  users: 'Associados',
  system_users: 'Operadores',
  orders: 'Pedidos',
  institutional_clients: 'Clientes institucionais',
  products: 'Produtos',
  professionals: 'Profissionais',
  reception: 'Acolhimento',
  reports: 'Relatórios',
  services: 'Serviços',
  tags: 'Etiquetas',
  files: 'Arquivos',
  users_api: 'API users',
  orders_files: 'Arquivos de pedidos',
  services_files: 'Arquivos de serviços',
  users_files: 'Arquivos de associados',
};

function labelFor(table) {
  return TABLE_LABELS[table] || table;
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new AppError(500, 'INTERNAL_ERROR', `Identificador inválido: ${name}`);
  }
  return name;
}

async function tableHasIsSample(client, table) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'is_sample'
     LIMIT 1`,
    [table]
  );
  return Boolean(result.rows[0]);
}

async function countSample(client, table) {
  if (!(await tableHasIsSample(client, table))) return 0;
  const result = await client.query(
    `SELECT COUNT(*)::int AS c FROM ${quoteIdent(table)} WHERE is_sample = true`
  );
  return result.rows[0].c;
}

async function getSummary() {
  return withClient(async (client) => {
    const tables = [];
    let total = 0;
    for (const table of SAMPLE_TABLES) {
      const count = await countSample(client, table);
      tables.push({ table, label: labelFor(table), count });
      total += count;
    }
    tables.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return { tables, total };
  });
}

async function deleteSampleBlobs(files) {
  for (const file of files) {
    try {
      const key = file.storage_key || file.storage_path;
      if (!key) continue;
      const driver = await getDriverForFile(file);
      await driver.delete({ key });
    } catch {
      /* blob ausente ou driver indisponível */
    }
  }
}

/**
 * Remove apenas linhas com is_sample = true, em ordem segura de FKs.
 * Preserva o system_user autenticado se ele for sample.
 */
async function deleteSampleData({ actorUserId } = {}) {
  const { deleted, skipped, sampleFiles } = await withClient(async (client) => {
    const deletedRows = [];
    const skippedRows = [];
    let sampleFilesList = [];

    try {
      await client.query('BEGIN');

      if (await tableHasIsSample(client, 'files')) {
        const filesRes = await client.query(
          `SELECT id, storage_path, storage_driver, storage_key FROM files WHERE is_sample = true`
        );
        sampleFilesList = filesRes.rows;
      }

      const psmExists = await client.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'product_stock_movements' LIMIT 1`
      );
      if (psmExists.rows[0] && (await tableHasIsSample(client, 'orders'))) {
        await client.query(`
          DELETE FROM product_stock_movements
          WHERE order_id IN (SELECT id FROM orders WHERE is_sample = true)
             OR product_id IN (SELECT id FROM products WHERE is_sample = true)
        `);
      }

      for (const table of SAMPLE_TABLES) {
        if (!(await tableHasIsSample(client, table))) {
          deletedRows.push({ table, label: labelFor(table), count: 0 });
          continue;
        }

        let result;
        if (table === 'system_users' && actorUserId != null) {
          result = await client.query(
            `DELETE FROM system_users
             WHERE is_sample = true AND id <> $1
             RETURNING id`,
            [actorUserId]
          );
          const kept = await client.query(
            `SELECT id FROM system_users WHERE is_sample = true AND id = $1`,
            [actorUserId]
          );
          if (kept.rows[0]) {
            skippedRows.push({
              table: 'system_users',
              reason: 'Operador autenticado (sample) foi preservado',
              id: kept.rows[0].id,
            });
          }
        } else {
          result = await client.query(
            `DELETE FROM ${quoteIdent(table)} WHERE is_sample = true RETURNING id`
          );
        }

        deletedRows.push({
          table,
          label: labelFor(table),
          count: result.rowCount || 0,
        });
      }

      await client.query('COMMIT');
      return { deleted: deletedRows, skipped: skippedRows, sampleFiles: sampleFilesList };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      if (err.code === '23503') {
        throw new AppError(
          409,
          'SAMPLE_DATA_BLOCKED',
          'Não foi possível excluir: há dados reais referenciando registros de exemplo. Remova ou desvincule essas referências e tente de novo.',
          { detail: err.detail || err.message }
        );
      }
      throw err;
    }
  });

  await deleteSampleBlobs(sampleFiles);

  const total = deleted.reduce((sum, row) => sum + row.count, 0);
  return { deleted, skipped, total };
}

module.exports = {
  SAMPLE_TABLES,
  getSummary,
  deleteSampleData,
};
