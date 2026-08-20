'use strict';

const { query } = require('./pool');

let ensured = false;
let ensuring = null;

async function ensureOperatorSessions() {
  if (ensured) return { created: false };
  if (ensuring) return ensuring;

  ensuring = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS operator_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
        app VARCHAR(32) NOT NULL,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        session_expires TIMESTAMP NOT NULL,
        last_activity TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (user_id, app)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_operator_sessions_token
        ON operator_sessions (session_token)
        WHERE is_active = true
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

module.exports = { ensureOperatorSessions, _resetEnsureFlag };
