import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureAdminUser, ensureAcolhimentoUser, getPool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const INSTALL_E2E_EMAIL = 'install-e2e@admin-e2e.local';
export const INSTALL_E2E_PASSWORD = 'InstallE2e123!';

export const INSTALL_ASSOCIATION = {
  associationName: 'Install E2E Assoc',
  associationFullName: 'ASSOCIACAO INSTALL E2E TESTE',
  associationEmail: 'contato-install-e2e@admin-e2e.local',
  associationPhone: '11988887777',
  associationSite: 'www.install-e2e.test',
  associationCnpj: '11222333000181',
  associationCity: 'Campinas',
  associationState: 'SP',
};

const ASSOCIATION_KEYS = [
  'VITE_ASSOCIATION_NAME',
  'VITE_ASSOCIATION_FULL_NAME',
  'VITE_ASSOCIATION_EMAIL',
  'VITE_ASSOCIATION_PHONE',
  'VITE_ASSOCIATION_SITE',
  'VITE_ASSOCIATION_CNPJ',
  'VITE_ASSOCIATION_CITY',
  'VITE_ASSOCIATION_STATE',
  'VITE_ASSOCIATION_LOGO',
  'VITE_ASSOCIATION_LOGO_MENU',
];

/** Minimal 1x1 PNG for logo upload in Playwright. */
export function installLogoPath() {
  const dir = path.join(__dirname, '../fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'install-logo.png');
  if (!fs.existsSync(filePath)) {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(filePath, png);
  }
  return filePath;
}

export async function prepareInstallE2e() {
  const pool = getPool();
  await pool.query(`DELETE FROM system_users`);
}

export async function cleanupInstallE2e() {
  const pool = getPool();

  const logoRows = await pool.query(
    `SELECT value FROM system_configs
     WHERE (system = 'registration' AND key IN ('VITE_ASSOCIATION_LOGO', 'VITE_ASSOCIATION_LOGO_MENU'))
        OR (system = 'kunk' AND key = 'VITE_KUNK_LOGO')`
  );
  const fileIds = new Set();
  for (const row of logoRows.rows) {
    const m = String(row.value || '').match(/\/files\/([0-9a-f-]{36})\//i);
    if (m) fileIds.add(m[1]);
  }

  await pool.query(`DELETE FROM system_users WHERE lower(email) = lower($1)`, [INSTALL_E2E_EMAIL]);
  await pool.query(
    `DELETE FROM system_configs
     WHERE system = 'registration'
       AND key = ANY($1::text[])
       AND (
         value ILIKE '%Install E2E%'
         OR value ILIKE '%install-e2e%'
         OR value ILIKE '%ASSOCIACAO INSTALL E2E%'
         OR value = 'www.install-e2e.test'
         OR value = '11222333000181'
         OR value = '11988887777'
         OR value = '5511988887777'
         OR value = 'Campinas'
         OR value ILIKE '%/files/%/download'
       )`,
    [ASSOCIATION_KEYS]
  );
  // Limpa logo/título Kunk gravados na instalação E2E (mesmo file id da associação).
  await pool.query(
    `UPDATE system_configs
     SET value = NULL, date_updated = NOW()
     WHERE system = 'kunk' AND key = 'VITE_KUNK_TITLE' AND value = $1`,
    [INSTALL_ASSOCIATION.associationName]
  );
  for (const id of fileIds) {
    await pool.query(
      `UPDATE system_configs
       SET value = NULL, date_updated = NOW()
       WHERE system = 'kunk' AND key = 'VITE_KUNK_LOGO' AND value LIKE $1`,
      [`%/files/${id}/%`]
    );
  }

  for (const id of fileIds) {
    await pool.query(`DELETE FROM files WHERE id = $1`, [id]);
  }
  await pool.query(`DELETE FROM files WHERE filename LIKE 'install-logo%'`);

  await ensureAdminUser();
  await ensureAcolhimentoUser();
}
