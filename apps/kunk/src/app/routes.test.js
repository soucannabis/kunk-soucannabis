import { describe, expect, it } from 'vitest';
import { APP_ROUTE_DEFS } from './routes.jsx';
import { PATHS, getNavigablePaths } from './menuConfig.js';
import { roleHomePath } from '../auth/roleRedirect.js';

describe('routes map', () => {
  it('defines all Portuguese fullPaths from PATHS (app routes)', () => {
    const fullPaths = APP_ROUTE_DEFS.map((r) => r.fullPath);
    const appPaths = Object.values(PATHS).filter((p) => String(p).startsWith('/app/'));
    expect(fullPaths).toEqual(expect.arrayContaining(appPaths));
    expect(fullPaths.filter((p) => String(p).startsWith('/app/'))).toHaveLength(appPaths.length);
  });

  it('every navigable menu path has a route def', () => {
    const menuPaths = getNavigablePaths(undefined, { isAdmin: true });
    const routePaths = new Set(APP_ROUTE_DEFS.map((r) => r.fullPath));
    for (const path of menuPaths) {
      expect(routePaths.has(path)).toBe(true);
    }
  });

  it('role redirects match legacy priority', () => {
    expect(roleHomePath(['Produção'])).toBe(PATHS.orders);
    expect(roleHomePath(['Acolhimento'])).toBe(PATHS.triage);
    expect(roleHomePath(['Administrador'])).toBe(PATHS.registration);
    expect(roleHomePath(['Administrador', 'Produção'])).toBe(PATHS.orders);
  });
});
