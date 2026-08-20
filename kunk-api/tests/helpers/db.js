'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query, closePool } = require('../../src/db/pool');
const authRepository = require('../../src/repositories/authRepository');

async function ensureAdminUser() {
  const email = 'admin@kunk-api.test';
  const password = 'TestAdmin123!';
  const existing = await authRepository.findByEmail(email);
  const hash = await authRepository.hashPassword(password);

  if (existing) {
    await query(`DELETE FROM operator_sessions WHERE user_id = $1`, [existing.id]).catch(() => {});
    await query(
      `UPDATE system_users SET
        password = $1,
        permissions = $2,
        status = 'active',
        is_session_active = false,
        session_token = NULL,
        internal_code = COALESCE(internal_code, 'ADMIN-TEST')
       WHERE id = $3`,
      [hash, JSON.stringify(['Administrador']), existing.id]
    );
  } else {
    await query(
      `INSERT INTO system_users (email, password, name, last_name, permissions, status, internal_code, date_created)
       VALUES ($1, $2, 'Admin', 'Test', $3, 'active', 'ADMIN-TEST', NOW())`,
      [email, hash, JSON.stringify(['Administrador'])]
    );
  }

  return { email, password };
}

async function ensureOperatorUser({
  email = 'acolhimento@kunk-api.test',
  password = 'TestAcol123!',
  permissions = ['Acolhimento'],
  name = 'Acol',
  last_name = 'Test',
  internal_code = 'ACOL-TEST',
} = {}) {
  const existing = await authRepository.findByEmail(email);
  const hash = await authRepository.hashPassword(password);
  const perms = JSON.stringify(permissions);

  if (existing) {
    await query(`DELETE FROM operator_sessions WHERE user_id = $1`, [existing.id]).catch(() => {});
    await query(
      `UPDATE system_users SET
        password = $1,
        permissions = $2,
        status = 'active',
        is_session_active = false,
        session_token = NULL,
        internal_code = COALESCE(internal_code, $4)
       WHERE id = $3`,
      [hash, perms, existing.id, internal_code]
    );
  } else {
    await query(
      `INSERT INTO system_users (email, password, name, last_name, permissions, status, internal_code, date_created)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())`,
      [email, hash, name, last_name, perms, internal_code]
    );
  }

  return { email, password, permissions };
}

/**
 * Proibido: testes NÃO podem TRUNCATE tabelas de negócio (apaga sample data).
 * Mantido só como stub exportado — chama cleanupTestLocalUsers se precisar limpar
 * linhas criadas pelos próprios testes (`*@test.local`).
 */
async function truncateBusinessTables() {
  throw new Error(
    'truncateBusinessTables está desabilitado: testes não podem apagar sample data. ' +
      'Use e-mails únicos (*@test.local) e cleanupTestLocalUsers() se precisar limpar.'
  );
}

/** Remove apenas users/associados criados por testes (domínio @test.local). */
async function cleanupTestLocalUsers() {
  await query(
    `DELETE FROM term_events WHERE contract_id IN (
       SELECT id FROM term_contracts WHERE user_code IN (
         SELECT user_code FROM users WHERE email_account LIKE '%@test.local'
       )
     )`
  );
  await query(
    `DELETE FROM term_signatures WHERE contract_id IN (
       SELECT id FROM term_contracts WHERE user_code IN (
         SELECT user_code FROM users WHERE email_account LIKE '%@test.local'
       )
     )`
  );
  await query(
    `DELETE FROM term_contracts WHERE user_code IN (
       SELECT user_code FROM users WHERE email_account LIKE '%@test.local'
     )`
  );
  await query(`DELETE FROM users_files WHERE user_id IN (SELECT id FROM users WHERE email_account LIKE '%@test.local')`);
  await query(`DELETE FROM users WHERE email_account LIKE '%@test.local'`);
}

module.exports = {
  query,
  closePool,
  ensureAdminUser,
  ensureOperatorUser,
  truncateBusinessTables,
  cleanupTestLocalUsers,
};
