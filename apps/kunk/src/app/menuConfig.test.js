import { describe, expect, it } from 'vitest';
import {
  MENU_SECTIONS,
  REMOVED_MENU_LABELS,
  PATHS,
  flattenMenuItems,
  getNavigablePaths,
} from './menuConfig.js';

describe('menuConfig v1', () => {
  it('keeps expected section labels in order', () => {
    expect(MENU_SECTIONS.map((s) => s.label)).toEqual([
      'Acolhimento',
      'Loja',
      'Profissionais',
      'Relatórios',
      'Sistema',
    ]);
  });

  it('includes core navigable paths', () => {
    const paths = getNavigablePaths(MENU_SECTIONS, { isAdmin: true });
    expect(paths).toContain(PATHS.registration);
    expect(paths).toContain(PATHS.triage);
    expect(paths).toContain(PATHS.orders);
    expect(paths).not.toContain(PATHS.newOrder);
    expect(paths).toContain(PATHS.services);
    expect(paths).toContain(PATHS.professionals);
    expect(paths).toContain(PATHS.products);
    expect(paths).toContain(PATHS.institutionalClients);
    expect(paths).toContain(PATHS.servicesReport);
    expect(paths).toContain(PATHS.analyticsDashboard);
    expect(paths).toContain(PATHS.systemHistory);
    expect(paths).toContain(PATHS.tags);
  });

  it('does not include removed item labels', () => {
    const labels = flattenMenuItems().map((i) => i.label);
    const sectionLabels = MENU_SECTIONS.map((s) => s.label);
    for (const removed of REMOVED_MENU_LABELS) {
      expect(labels).not.toContain(removed);
      expect(sectionLabels).not.toContain(removed);
    }
  });

  it('includes Tags under Sistema as navigable path', () => {
    const tags = flattenMenuItems().find((i) => i.id === 'tags');
    expect(tags).toMatchObject({ label: 'Tags', path: PATHS.tags });
    expect(tags.action).toBeUndefined();
    const sistema = MENU_SECTIONS.find((s) => s.id === 'sistema');
    expect(sistema.items.map((i) => i.id)).toEqual(['historico', 'tags']);
    expect(getNavigablePaths()).toContain(PATHS.tags);
  });
});
