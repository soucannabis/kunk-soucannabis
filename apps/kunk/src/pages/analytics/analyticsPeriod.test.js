import { describe, expect, it } from 'vitest';
import {
  periodFromPreset,
  syncDatesToBlocks,
  filterHash,
  buildAnalyticsQuery,
  formatKpiValue,
} from './analyticsPeriod.js';

describe('analyticsPeriod', () => {
  it('periodFromPreset month starts on day 1', () => {
    const anchor = new Date(2026, 6, 12); // Jul 12
    const p = periodFromPreset('month', anchor);
    expect(p.start).toBe('2026-07-01');
    expect(p.end).toBe('2026-07-12');
    expect(p.preset).toBe('month');
  });

  it('syncDatesToBlocks keeps status/tags', () => {
    const next = syncDatesToBlocks(
      {
        a: { start: '2020-01-01', end: '2020-02-01', status: ['Pago'], tags: ['x'] },
      },
      { start: '2026-01-01', end: '2026-01-31' }
    );
    expect(next.a.start).toBe('2026-01-01');
    expect(next.a.end).toBe('2026-01-31');
    expect(next.a.status).toEqual(['Pago']);
    expect(next.a.tags).toEqual(['x']);
  });

  it('filterHash stable for status order', () => {
    const a = filterHash({ start: 'a', end: 'b', status: ['2', '1'], tags: [] }, 'month');
    const b = filterHash({ start: 'a', end: 'b', status: ['1', '2'], tags: [] }, 'month');
    expect(a).toBe(b);
  });

  it('buildAnalyticsQuery includes params', () => {
    const qs = buildAnalyticsQuery(
      { start: '2026-01-01', end: '2026-01-31', status: ['Pago'], tags: ['vip'] },
      'day'
    );
    expect(qs).toContain('start=2026-01-01');
    expect(qs).toContain('group_by=day');
    expect(qs).toContain('status=Pago');
    expect(qs).toContain('tags=vip');
  });

  it('formatKpiValue currency', () => {
    expect(formatKpiValue(10, 'currency')).toMatch(/R\$/);
  });
});
