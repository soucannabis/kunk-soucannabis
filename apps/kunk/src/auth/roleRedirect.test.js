import { describe, expect, it } from 'vitest';
import { roleHomePath, hasAnyRole, pageTitleFromPath } from './roleRedirect.js';
import { PATHS, KUNK_STAFF_ROLES } from '../app/menuConfig.js';

describe('roleRedirect', () => {
  it('maps roles to home paths', () => {
    expect(roleHomePath(['Produção', 'Acolhimento'])).toBe(PATHS.orders);
    expect(roleHomePath(['Acolhimento', 'Administrador'])).toBe(PATHS.triage);
    expect(roleHomePath([])).toBe(PATHS.registration);
  });

  it('hasAnyRole intersects lists', () => {
    expect(hasAnyRole(['Acolhimento'], KUNK_STAFF_ROLES)).toBe(true);
    expect(hasAnyRole(['Financeiro'], KUNK_STAFF_ROLES)).toBe(false);
  });

  it('pageTitleFromPath returns Portuguese titles', () => {
    expect(pageTitleFromPath(PATHS.orders)).toBe('Pedidos');
    expect(pageTitleFromPath(PATHS.registration)).toBe('Associados');
  });
});
