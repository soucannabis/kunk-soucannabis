'use strict';

const { query } = require('./pool');

let ensured = false;
let ensuring = null;

async function migrateLegacyEmailJson() {
  const result = await query(`SELECT id, email, scopes FROM users_api`);
  for (const row of result.rows) {
    if (row.scopes != null) {
      // Legacy rows may still hold JSON in email even after scopes exists
      if (typeof row.email === 'string' && row.email.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(row.email);
          if (parsed && typeof parsed === 'object') {
            const label = String(parsed.label || 'api-token').slice(0, 255);
            await query(`UPDATE users_api SET email = $2 WHERE id = $1`, [row.id, label]);
          }
        } catch {
          /* keep email as-is */
        }
      }
      continue;
    }

    let label = row.email || 'api-token';
    let scopes = ['*'];
    if (typeof row.email === 'string' && row.email.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(row.email);
        if (parsed && typeof parsed === 'object') {
          label = String(parsed.label || 'api-token').slice(0, 255);
          if (Array.isArray(parsed.scopes) && parsed.scopes.length) scopes = parsed.scopes;
        }
      } catch {
        /* plain label */
      }
    } else {
      label = String(label || 'api-token').slice(0, 255);
    }

    await query(`UPDATE users_api SET email = $2, scopes = $3::jsonb WHERE id = $1`, [
      row.id,
      label,
      JSON.stringify(scopes),
    ]);
  }
}

async function ensureUsersApiTokenPrefix() {
  if (ensured) return { created: false };
  if (ensuring) return ensuring;

  ensuring = (async () => {
    await query(`ALTER TABLE users_api ADD COLUMN IF NOT EXISTS token_prefix VARCHAR(32)`);
    await query(`ALTER TABLE users_api ADD COLUMN IF NOT EXISTS scopes JSONB`);
    await migrateLegacyEmailJson();
    await query(`UPDATE users_api SET scopes = '["*"]'::jsonb WHERE scopes IS NULL`);
    await query(`ALTER TABLE users_api ALTER COLUMN scopes SET DEFAULT '["*"]'::jsonb`);
    await query(`ALTER TABLE users_api ALTER COLUMN scopes SET NOT NULL`);
    // Keep email as a short label field (never store scopes JSON here)
    await query(`
      ALTER TABLE users_api
      ALTER COLUMN email TYPE VARCHAR(255)
      USING LEFT(COALESCE(email::text, ''), 255)
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_api_token_prefix_uidx
        ON users_api (token_prefix)
    `);
    ensured = true;
    return { created: true };
  })();

  try {
    return await ensuring;
  } finally {
    ensuring = null;
  }
}

function _resetEnsureFlag() {
  ensured = false;
}

module.exports = { ensureUsersApiTokenPrefix, _resetEnsureFlag };
