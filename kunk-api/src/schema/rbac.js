'use strict';

const ACTIONS = ['create', 'read', 'update', 'delete'];

/** CRUD shorthand → set of actions */
function expand(mask) {
  const map = { C: 'create', R: 'read', U: 'update', D: 'delete' };
  return new Set([...mask].map((c) => map[c]).filter(Boolean));
}

/**
 * Matriz RBAC v1 — authorization.md
 * R* = read scoped (handled in service layer via scopeFilter)
 */
const MATRIX = {
  Administrador: Object.fromEntries(
    [
      'users', 'system_users', 'orders', 'services', 'products', 'institutional_clients',
      'professionals',
      'reception', 'tags', 'reports', 'files', 'orders_files', 'services_files', 'users_files',
      'users_api', 'system_activity',
    ].map((c) => [c, expand('CRUD')])
  ),
  Acolhimento: {
    users: expand('CRUD'),
    system_users: expand('R'),
    orders: expand('CRUD'),
    services: expand('CRUD'),
    products: expand('R'),
    institutional_clients: expand('CRUD'),
    professionals: expand('CRUD'),
    reception: expand('CRUD'),
    tags: expand('CRUD'),
    reports: expand('R'),
    files: expand('CRUD'),
    orders_files: expand('CRUD'),
    services_files: expand('CRUD'),
    users_files: expand('CRUD'),
    system_activity: expand('R'),
  },
  Produção: {
    users: expand('R'),
    institutional_clients: expand('R'),
    orders: expand('RU'),
    services: expand('RU'),
    products: expand('RU'),
    professionals: expand('R'),
    reception: expand('RU'),
    tags: expand('R'),
    reports: expand('R'),
    files: expand('R'),
    orders_files: expand('R'),
    services_files: expand('RU'),
    users_files: expand('R'),
    system_activity: expand('R'),
  },
  Financeiro: {
    users: expand('R'),
    institutional_clients: expand('R'),
    orders: expand('RU'),
    services: expand('RU'),
    products: expand('R'),
    professionals: expand('R'),
    tags: expand('R'),
    reports: expand('R'),
    files: expand('R'),
    orders_files: expand('R'),
    services_files: expand('R'),
    users_files: expand('R'),
  },
  /** Portal do relatório de serviços — escopo via internal_code = professional_code. Sem files. */
  Profissional: {
    services: expand('R'),
    professionals: expand('RU'),
  },
  api: Object.fromEntries(
    [
      'users', 'system_users', 'orders', 'services', 'products', 'institutional_clients',
      'professionals',
      'reception', 'tags', 'reports', 'files', 'orders_files', 'services_files', 'users_files',
      'users_api', 'system_activity',
    ].map((c) => [c, expand('CRUD')])
  ),
};

const STAFF_ROLES = ['Administrador', 'Acolhimento', 'Produção', 'Financeiro'];

const SCOPED_ROLES = {
  // services.professional_id = professionals.professional_code
  Profissional: { field: 'professional_id', fromUser: 'internal_code' },
};

/** Campos que o portal (só Profissional) não pode gravar no próprio cadastro. */
const PORTAL_PROFESSIONAL_DENIED_FIELDS = new Set([
  'donation_balance',
  'recipient_id',
  'is_collaborator',
  'is_prescriber',
  'active',
  'professional_code',
  'calendar_id',
  'consultation_price',
  'contest_reports',
]);

function parseRoles(permissions) {
  if (!permissions) return [];
  if (Array.isArray(permissions)) return permissions;
  try {
    const parsed = JSON.parse(permissions);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* plain string */
  }
  return String(permissions)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function can(roles, collection, action) {
  const list = Array.isArray(roles) ? roles : parseRoles(roles);
  if (list.includes('Administrador') || list.includes('api')) {
    return MATRIX.Administrador[collection]?.has(action) || false;
  }
  for (const role of list) {
    if (MATRIX[role]?.[collection]?.has(action)) return true;
  }
  return false;
}

function isStaffRoles(roles) {
  const list = Array.isArray(roles) ? roles : parseRoles(roles);
  return list.some((r) => STAFF_ROLES.includes(r));
}

function isProfessionalRole(roles) {
  return (Array.isArray(roles) ? roles : parseRoles(roles)).includes('Profissional');
}

/** Portal-only: tem Profissional e nenhum papel de staff. */
function isPortalProfessional(roles) {
  return isProfessionalRole(roles) && !isStaffRoles(roles);
}

/**
 * @param {string|string[]} roles
 * @param {object} [user]
 * @param {string} [collection] professionals → professional_code; services (default) → professional_id
 */
function scopeFilterFor(roles, user, collection) {
  const list = Array.isArray(roles) ? roles : parseRoles(roles);
  if (list.includes('Administrador') || list.includes('api') || list.includes('Acolhimento')) {
    return null;
  }
  for (const role of list) {
    const cfg = SCOPED_ROLES[role];
    if (!cfg || !user?.[cfg.fromUser]) continue;
    const field =
      role === 'Profissional' && collection === 'professionals' ? 'professional_code' : cfg.field;
    return { field, value: user[cfg.fromUser] };
  }
  return null;
}

function portalProfessionalDeniedFields(roles, body) {
  if (!isPortalProfessional(roles)) return [];
  return Object.keys(body || {}).filter((k) => PORTAL_PROFESSIONAL_DENIED_FIELDS.has(k));
}

function hasScope(scopes, collection, action) {
  if (!scopes || scopes.includes('*')) return true;
  const writeActions = new Set(['create', 'update']);
  for (const scope of scopes) {
    if (scope === `items:${collection}:*` || scope === `items:*:*`) return true;
    if (action === 'read' && (scope === `items:${collection}:read` || scope === 'items:*:read')) {
      return true;
    }
    if (writeActions.has(action) && (scope === `items:${collection}:write` || scope === 'items:*:write')) {
      return true;
    }
    if (action === 'delete' && (scope === `items:${collection}:delete` || scope === 'items:*:delete')) {
      return true;
    }
  }
  return false;
}

/** Collections grantable on API tokens (excludes users_api — tokens cannot manage tokens). */
const API_TOKEN_COLLECTIONS = Object.keys(MATRIX.api).filter((c) => c !== 'users_api');

const API_TOKEN_SCOPE_ACTIONS = new Set(['read', 'write', 'delete', '*']);

/**
 * Validate and normalize API token scopes.
 * Accepts `*` or `items:<collection|*>:<read|write|delete|*>`.
 */
function normalizeApiTokenScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    const err = new Error('scopes é obrigatório (array não vazio)');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (scopes.includes('*')) {
    if (scopes.length !== 1) {
      const err = new Error('Scope * deve ser o único item da lista');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return ['*'];
  }
  const out = [];
  for (const raw of scopes) {
    const scope = String(raw || '').trim();
    const match = /^items:([a-z0-9_*]+):(read|write|delete|\*)$/.exec(scope);
    if (!match) {
      const err = new Error(`Scope inválido: ${scope}`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const [, collection, action] = match;
    if (!API_TOKEN_SCOPE_ACTIONS.has(action)) {
      const err = new Error(`Ação de scope inválida: ${action}`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (collection === 'users_api') {
      const err = new Error('Não é permitido conceder acesso a users_api');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (collection !== '*' && !API_TOKEN_COLLECTIONS.includes(collection)) {
      const err = new Error(`Coleção de scope inválida: ${collection}`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    out.push(`items:${collection}:${action}`);
  }
  return [...new Set(out)];
}

module.exports = {
  ACTIONS,
  MATRIX,
  SCOPED_ROLES,
  STAFF_ROLES,
  PORTAL_PROFESSIONAL_DENIED_FIELDS,
  API_TOKEN_COLLECTIONS,
  parseRoles,
  can,
  isStaffRoles,
  isProfessionalRole,
  isPortalProfessional,
  scopeFilterFor,
  portalProfessionalDeniedFields,
  hasScope,
  normalizeApiTokenScopes,
};
