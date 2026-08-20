'use strict';

const { can, hasScope, scopeFilterFor, isPortalProfessional } = require('../schema/rbac');
const { AppError } = require('../utils/response');

function assertCan(req, collection, action) {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária');
  }

  if (req.auth?.type === 'api_key') {
    if (!hasScope(req.auth.scopes, collection, action)) {
      throw new AppError(403, 'FORBIDDEN', `Sem permissão para ${action} em ${collection}`);
    }
  } else {
    const roles = req.user.roles || req.user.permissions || [];
    if (!can(roles, collection, action)) {
      throw new AppError(403, 'FORBIDDEN', `Sem permissão para ${action} em ${collection}`);
    }
  }

  req.scopeFilter = scopeFilterFor(req.user.roles || req.user.permissions, req.user, collection);
}

function authorize(collection, action) {
  return (req, res, next) => {
    try {
      assertCan(req, collection, action);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Admin-only routes (tokens, operadores, templates DocSign).
 * Session: role Administrador. API key: only scopes `*`.
 * Restricted API keys (roles includes `api` but scopes are not `*`) are forbidden.
 */
function authorizeAdmin(req, res, next) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária');
    }
    if (req.auth?.type === 'api_key') {
      if (req.auth.scopes?.includes('*')) {
        return next();
      }
      throw new AppError(403, 'FORBIDDEN', 'Apenas administrador');
    }
    const roles = req.user.roles || req.user.permissions || [];
    const list = Array.isArray(roles) ? roles : [];
    if (list.includes('Administrador')) {
      return next();
    }
    throw new AppError(403, 'FORBIDDEN', 'Apenas administrador');
  } catch (err) {
    next(err);
  }
}

/**
 * Require an exact session role (e.g. Administrador for admin UI routes).
 * Does not accept API keys with only `api` / `*` — use authorizeAdmin for those.
 */
function requireRole(roleName) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária');
      }
      const roles = req.user.roles || req.user.permissions || [];
      const list = Array.isArray(roles) ? roles : [];
      if (!list.includes(roleName)) {
        throw new AppError(403, 'FORBIDDEN', `Role ${roleName} necessária`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Bloqueia rotas de staff (saldo, convite de portal) para sessão só Profissional. */
function forbidPortalProfessional(req, res, next) {
  try {
    if (isPortalProfessional(req.user?.roles || req.user?.permissions)) {
      throw new AppError(403, 'FORBIDDEN', 'Ação reservada à equipe');
    }
    next();
  } catch (err) {
    next(err);
  }
}

function authorizeDomain(permission) {
  // permission like "orders.create" → map to collection/action loosely
  const [collection, action] = String(permission).split('.');
  const actionMap = {
    create: 'create',
    read: 'read',
    update: 'update',
    delete: 'delete',
    status: 'update',
    production: 'update',
    payment: 'update',
    complete: 'update',
    attendant: 'update',
    batch: 'update',
    favorite: 'update',
    handbook: 'update',
    run: 'read',
  };
  return authorize(collection, actionMap[action] || 'read');
}

module.exports = {
  assertCan,
  authorize,
  authorizeAdmin,
  authorizeDomain,
  requireRole,
  forbidPortalProfessional,
};
