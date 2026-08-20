'use strict';

function ok(data, meta = null) {
  return { data, meta, errors: null };
}

function fail(code, message, details = null) {
  return {
    data: null,
    meta: null,
    errors: [{ code, message, details }],
  };
}

class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ok, fail, AppError };
