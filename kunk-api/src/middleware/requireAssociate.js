'use strict';

const associateAuthRepository = require('../repositories/associateAuthRepository');
const { AppError } = require('../utils/response');
const { extractBearer } = require('./authenticate');

async function requireAssociate(req, res, next) {
  try {
    const bearer = extractBearer(req);
    const associateCookie = req.cookies?.associate_session;

    // Bearer on associate routes is ambiguous; cookies from the operator panel
    // (kunk_oss_session_*) share the localhost domain across ports and must be ignored.
    if (bearer) {
      throw new AppError(401, 'AUTH_CONFLICT', 'Use apenas o cookie associate_session nesta rota');
    }

    if (!associateCookie) {
      throw new AppError(401, 'UNAUTHORIZED', 'Autenticação de associado necessária');
    }

    const row = await associateAuthRepository.resolveSessionRow(associateCookie);
    if (!row) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada');
    }

    req.auth = { type: 'session', subject: 'associate' };
    req.associate = associateAuthRepository.publicAssociate(row);
    req.associateRow = row;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAssociate };
