import { PRESET_TO_GROUP_BY } from './analyticsLayout.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Resolve start/end a partir do preset (âncora = hoje local). */
export function periodFromPreset(preset, anchor = new Date()) {
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let start = new Date(end);
  if (preset === 'day') {
    // mesmo dia
  } else if (preset === 'week') {
    start.setDate(end.getDate() - 6);
  } else if (preset === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (preset === 'year') {
    start = new Date(end.getFullYear(), 0, 1);
  } else {
    start.setMonth(end.getMonth() - 11);
    start.setDate(1);
  }
  return { start: toYmd(start), end: toYmd(end), preset };
}

export function defaultGlobalPeriod() {
  return periodFromPreset('year');
}

export function emptyBlockFilter(period) {
  return {
    start: period.start,
    end: period.end,
    status: [],
    tags: [],
  };
}

export function syncDatesToBlocks(blockFilters, period) {
  const next = { ...blockFilters };
  for (const id of Object.keys(next)) {
    next[id] = {
      ...next[id],
      start: period.start,
      end: period.end,
    };
  }
  return next;
}

export function filtersEqualDates(a, b) {
  return a?.start === b?.start && a?.end === b?.end;
}

export function filterHash(filters, groupBy) {
  return JSON.stringify({
    start: filters?.start || '',
    end: filters?.end || '',
    status: [...(filters?.status || [])].sort(),
    tags: [...(filters?.tags || [])].sort(),
    group_by: groupBy || 'month',
  });
}

export function buildAnalyticsQuery(filters, groupBy) {
  const params = new URLSearchParams();
  if (filters?.start) params.set('start', filters.start);
  if (filters?.end) params.set('end', filters.end);
  params.set('group_by', groupBy || 'month');
  for (const s of filters?.status || []) params.append('status', s);
  for (const t of filters?.tags || []) params.append('tags', t);
  return params.toString();
}

export function groupByFromPreset(preset) {
  return PRESET_TO_GROUP_BY[preset] || 'month';
}

export function formatKpiValue(value, format = 'number') {
  const n = Number(value) || 0;
  if (format === 'currency' || format === 'avg') {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return n.toLocaleString('pt-BR');
}

export function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
