'use strict';

const SENSITIVE_BY_TABLE = {
  users: ['account_password', 'session_token', 'password_reset_token'],
  system_users: ['password', 'session_token', 'utalk_token'],
};

const GLOBAL_SENSITIVE = [
  'password',
  'account_password',
  'session_token',
  'password_reset_token',
  'token',
  'utalk_token',
];

function sanitizeRecord(table, data) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map((row) => sanitizeRecord(table, row));
  if (typeof data !== 'object') return data;

  const deny = new Set([
    ...(SENSITIVE_BY_TABLE[table] || []),
    ...GLOBAL_SENSITIVE,
  ]);

  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (deny.has(key)) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = sanitizeRecord(table, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = { sanitizeRecord, SENSITIVE_BY_TABLE, GLOBAL_SENSITIVE };
