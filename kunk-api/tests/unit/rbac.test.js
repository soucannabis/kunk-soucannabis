'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { can, hasScope, parseRoles, scopeFilterFor } = require('../../src/schema/rbac');

describe('rbac', () => {
  it('Administrador can CRUD all core collections', () => {
    assert.equal(can(['Administrador'], 'orders', 'delete'), true);
    assert.equal(can(['Administrador'], 'users_api', 'create'), true);
  });

  it('Produção cannot create users', () => {
    assert.equal(can(['Produção'], 'users', 'create'), false);
    assert.equal(can(['Produção'], 'users', 'read'), true);
  });

  it('Profissional scopes services by professional_id from internal_code', () => {
    const scope = scopeFilterFor(['Profissional'], { internal_code: 'uuid-pro-1' });
    assert.deepEqual(scope, { field: 'professional_id', value: 'uuid-pro-1' });
    assert.equal(can(['Profissional'], 'services', 'read'), true);
    assert.equal(can(['Profissional'], 'services', 'update'), false);
    assert.equal(can(['Profissional'], 'files', 'read'), false);
    assert.equal(can(['Profissional'], 'services_files', 'read'), false);
  });

  it('Profissional scopes professionals by professional_code', () => {
    const {
      isStaffRoles,
      isProfessionalRole,
      isPortalProfessional,
      portalProfessionalDeniedFields,
    } = require('../../src/schema/rbac');
    const user = { internal_code: 'uuid-pro-1' };
    assert.deepEqual(scopeFilterFor(['Profissional'], user, 'services'), {
      field: 'professional_id',
      value: 'uuid-pro-1',
    });
    assert.deepEqual(scopeFilterFor(['Profissional'], user, 'professionals'), {
      field: 'professional_code',
      value: 'uuid-pro-1',
    });
    assert.equal(isStaffRoles(['Profissional']), false);
    assert.equal(isProfessionalRole(['Profissional']), true);
    assert.equal(isPortalProfessional(['Profissional']), true);
    assert.equal(isPortalProfessional(['Acolhimento', 'Profissional']), false);
    assert.deepEqual(
      portalProfessionalDeniedFields(['Profissional'], { donation_balance: 10, name: 'X' }),
      ['donation_balance']
    );
    assert.deepEqual(portalProfessionalDeniedFields(['Acolhimento'], { donation_balance: 10 }), []);
  });

  it('Prescritor is not a login role', () => {
    assert.equal(can(['Prescritor'], 'orders', 'read'), false);
    assert.equal(scopeFilterFor(['Prescritor'], { internal_code: 'x' }), null);
  });

  it('parses permissions JSON and CSV', () => {
    assert.deepEqual(parseRoles('["Administrador"]'), ['Administrador']);
    assert.deepEqual(parseRoles('Acolhimento,Produção'), ['Acolhimento', 'Produção']);
  });

  it('api scopes map to actions', () => {
    assert.equal(hasScope(['items:orders:read'], 'orders', 'read'), true);
    assert.equal(hasScope(['items:orders:read'], 'orders', 'delete'), false);
    assert.equal(hasScope(['*'], 'users', 'delete'), true);
  });

  it('normalizeApiTokenScopes validates collections and actions', () => {
    const { normalizeApiTokenScopes, API_TOKEN_COLLECTIONS } = require('../../src/schema/rbac');
    assert.ok(API_TOKEN_COLLECTIONS.includes('orders'));
    assert.ok(!API_TOKEN_COLLECTIONS.includes('users_api'));
    assert.deepEqual(normalizeApiTokenScopes(['*']), ['*']);
    assert.deepEqual(
      normalizeApiTokenScopes(['items:orders:read', 'items:products:write']),
      ['items:orders:read', 'items:products:write']
    );
    assert.throws(() => normalizeApiTokenScopes(['items:users_api:read']), /users_api/);
    assert.throws(() => normalizeApiTokenScopes(['bogus']), /inválido/i);
  });
});
