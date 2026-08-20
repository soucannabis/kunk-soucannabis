#!/usr/bin/env node
'use strict';

/**
 * Limpa a tabela system_configs (variáveis do Admin).
 *
 * Uso:
 *   cd kunk-api && npm run clean:system-configs              # dry-run
 *   cd kunk-api && npm run clean:system-configs -- --yes     # executa
 *
 * Na raiz do monorepo:
 *   npm run clean:system-configs -- --yes
 *
 * Flags:
 *   --yes            Executa a limpeza (sem isso só lista o plano)
 *   --force          Permite rodar com NODE_ENV=production
 *   --no-role-pages  Não recria kunk.role_pages após o TRUNCATE
 *
 * Por padrão, após limpar, recria `kunk.role_pages` mínimo (todas as páginas
 * para roles staff; Profissional → relatório de serviços) para o menu do Kunk
 * continuar funcionando.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { withClient, closePool } = require('../src/db/pool');

const DEFAULT_ROLE_PAGES = {
  Administrador: ['*'],
  Acolhimento: ['*'],
  Produção: ['*'],
  Financeiro: ['*'],
  Profissional: ['relatorios-servicos'],
};

function parseArgs(argv) {
  return {
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
    noRolePages: argv.includes('--no-role-pages'),
  };
}

async function plan(client) {
  const total = await client.query(`SELECT COUNT(*)::int AS n FROM system_configs`);
  const bySystem = await client.query(
    `SELECT system, COUNT(*)::int AS key_count
     FROM system_configs
     GROUP BY system
     ORDER BY system ASC`
  );
  return {
    total: total.rows[0]?.n || 0,
    systems: bySystem.rows,
  };
}

async function ensureRolePages(client) {
  const value = JSON.stringify(DEFAULT_ROLE_PAGES);
  await client.query(
    `INSERT INTO system_configs (
       system, key, value, value_type, is_sensitive, is_required,
       allow_hardcoded, hardcoded_default, description, date_created
     ) VALUES (
       'kunk', 'role_pages', $1, 'json', false, false,
       true, $1, 'Páginas por role no app Kunk (* = todas)', NOW()
     )`,
    [value]
  );
}

async function run(client, args) {
  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE TABLE system_configs RESTART IDENTITY CASCADE');
    let rolePages = 'skipped';
    if (!args.noRolePages) {
      await ensureRolePages(client);
      rolePages = 'inserted';
    }
    await client.query('COMMIT');
    return { rolePages };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { resolvePgUrl } = require('../src/config/env');

  if (!resolvePgUrl()) {
    console.error('PG_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE) é obrigatória (kunk-api/.env)');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && !args.force) {
    console.error('Recusado em NODE_ENV=production. Use --force se tiver certeza.');
    process.exit(1);
  }

  try {
    await withClient(async (client) => {
      const preview = await plan(client);

      console.log('Plano: limpar system_configs.\n');
      if (preview.systems.length === 0) {
        console.log('  (tabela vazia)');
      } else {
        for (const row of preview.systems) {
          console.log(`  ${String(row.system).padEnd(24)} ${row.key_count} chave(s)`);
        }
      }
      console.log(`\nTotal: ${preview.total} linha(s)`);
      console.log(
        args.noRolePages
          ? 'Após limpar: tabela vazia (sem role_pages).'
          : 'Após limpar: recria kunk.role_pages (mínimo).'
      );

      if (!args.yes) {
        console.log('\nDry-run. Passe --yes para executar.');
        return;
      }

      if (preview.total === 0 && args.noRolePages) {
        console.log('\nNada a fazer.');
        return;
      }

      const result = await run(client, args);
      console.log('\nConcluído.');
      console.log(`  TRUNCATE system_configs (${preview.total} linha(s) removida(s))`);
      console.log(`  role_pages: ${result.rolePages}`);
    });
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
