'use strict';

const { query } = require('./pool');

const LOGIN_EMAIL_UNIQUE_INDEX = 'users_email_account_login_uidx';

const CREATE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS ${LOGIN_EMAIL_UNIQUE_INDEX}
    ON users (lower(btrim(email_account)))
    WHERE email_account IS NOT NULL
      AND btrim(email_account) <> ''
      AND (status IS NULL OR status <> 'patient')
`;

let ensured = false;
let ensuring = null;

async function ensureEmailAccountUnique() {
  if (ensured) return { created: false };
  if (ensuring) return ensuring;

  ensuring = (async () => {
    await query(CREATE_INDEX_SQL);
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

module.exports = {
  LOGIN_EMAIL_UNIQUE_INDEX,
  CREATE_INDEX_SQL,
  ensureEmailAccountUnique,
  _resetEnsureFlag,
};
