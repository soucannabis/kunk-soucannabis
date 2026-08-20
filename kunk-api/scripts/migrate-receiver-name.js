'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');
const { resolvePgUrl } = require('../src/config/env');

async function main() {
  const connectionString = resolvePgUrl();
  if (!connectionString) {
    throw new Error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) is required');
  }
  const c = new Client({ connectionString });
  await c.connect();
  await c.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_name VARCHAR(255)');
  await c.query(`
    UPDATE orders
    SET receiver_name = associate_name
    WHERE receiver_name IS NULL
      AND associate_name IS NOT NULL
      AND TRIM(associate_name) <> ''
  `);
  const r = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'receiver_name'`
  );
  console.log('receiver_name column:', r.rows);
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
