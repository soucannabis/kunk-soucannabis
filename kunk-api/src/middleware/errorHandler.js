'use strict';

const { fail, AppError } = require('../utils/response');
const systemErrorsService = require('../services/systemErrorsService');

/** Constraint / tabela / valor do node-pg — só para log, nunca na resposta HTTP. */
function pgLogFields(err) {
  const fields = { code: err.code };
  if (err.constraint) fields.constraint = err.constraint;
  if (err.table) fields.table = err.table;
  if (err.column) fields.column = err.column;
  if (err.detail) fields.detail = err.detail;
  return fields;
}

function logPgError(err) {
  console.error('[kunk-api] pg', pgLogFields(err));
}

function mapPgError(err) {
  switch (err.code) {
    case '23503': // foreign_key_violation
      return new AppError(
        400,
        'VALIDATION_ERROR',
        'Referência inválida: valor não existe na tabela relacionada'
      );
    case '23505': { // unique_violation
      if (err.constraint === 'users_email_account_login_uidx') {
        return new AppError(409, 'ACCOUNT_EXISTS', 'Conta já existe. Faça login.');
      }
      return new AppError(409, 'CONFLICT', 'Registro duplicado');
    }
    case '23502': // not_null_violation
      return new AppError(400, 'VALIDATION_ERROR', 'Campo obrigatório ausente');
    case '22P02': {
      // invalid_text_representation (UUID malformado, ou string em coluna INTEGER)
      const pgMsg = String(err.message || '');
      if (
        /integer|smallint|bigint|numeric/i.test(pgMsg) &&
        /assinatura_termo|documentos|dados_pessoais|cadastro_criado|concluido/i.test(pgMsg)
      ) {
        return new AppError(
          500,
          'SCHEMA_MISMATCH',
          'Banco desatualizado: users.associate_status ainda é numérico. Reinicie a API (migração automática) ou rode alter-associate-status-ptbr.sql'
        );
      }
      return new AppError(400, 'VALIDATION_ERROR', 'Formato de valor inválido');
    }
    default:
      return null;
  }
}

function shouldRecordError(err) {
  if (err instanceof AppError) {
    return err.status >= 500;
  }
  if (err?.type === 'entity.parse.failed') return false;
  const mapped = err?.code ? mapPgError(err) : null;
  if (mapped && mapped.status < 500) return false;
  return true;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    if (shouldRecordError(err)) {
      void systemErrorsService.recordSafe(
        systemErrorsService.payloadFromBackendError(err, req)
      );
    }
    return res.status(err.status).json(fail(err.code, err.message, err.details));
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(fail('VALIDATION_ERROR', 'JSON inválido'));
  }

  const mapped = err?.code ? mapPgError(err) : null;
  if (mapped) {
    logPgError(err);
    if (shouldRecordError(mapped)) {
      void systemErrorsService.recordSafe(
        systemErrorsService.payloadFromBackendError(mapped, req)
      );
    }
    return res.status(mapped.status).json(fail(mapped.code, mapped.message));
  }

  console.error('[kunk-api]', err);
  void systemErrorsService.recordSafe(systemErrorsService.payloadFromBackendError(err, req));
  const message =
    process.env.NODE_ENV === 'production' ? 'Erro interno' : err.message || 'Erro interno';
  return res.status(500).json(fail('INTERNAL_ERROR', message));
}

module.exports = { errorHandler, mapPgError, shouldRecordError };
