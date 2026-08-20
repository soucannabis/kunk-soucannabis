'use strict';

const { ensureSystemBackups } = require('../db/ensureSystemBackups');

let ensured = false;

async function ensureOnce() {
  if (ensured) return;
  await ensureSystemBackups();
  ensured = true;
}

async function beforeBackupRoutes(req, res, next) {
  try {
    await ensureOnce();
    next();
  } catch (err) {
    next(err);
  }
}

function _resetEnsureFlag() {
  ensured = false;
}

module.exports = {
  beforeBackupRoutes,
  ensureOnce,
  _resetEnsureFlag,
};
