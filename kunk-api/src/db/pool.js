'use strict';

const { Pool } = require('pg');
const { env } = require('../config/env');

let pool = null;

function getPool() {
  if (!pool) {
    if (!env.pgUrl) {
      throw new Error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) is required');
    }
    pool = new Pool({ connectionString: env.pgUrl });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function checkConnection() {
  const result = await query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, withClient, checkConnection, closePool };
