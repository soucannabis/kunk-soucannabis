const PREFIX = 'kunk.admin.dados';

function orderKey(collection) {
  return `${PREFIX}.columnOrder.${collection}`;
}

function sortKey(collection) {
  return `${PREFIX}.sort.${collection}`;
}

export function loadColumnOrder(collection) {
  try {
    const raw = localStorage.getItem(orderKey(collection));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export function saveColumnOrder(collection, fields) {
  try {
    localStorage.setItem(orderKey(collection), JSON.stringify(fields));
  } catch {
    /* ignore quota */
  }
}

/**
 * Merge saved order with current visible fields (keep only visible, append new ones).
 */
export function applyColumnOrder(visibleFields, savedOrder) {
  if (!visibleFields?.length) return ['id'];
  if (!savedOrder?.length) return [...visibleFields];
  const set = new Set(visibleFields);
  const ordered = savedOrder.filter((f) => set.has(f));
  for (const f of visibleFields) {
    if (!ordered.includes(f)) ordered.push(f);
  }
  return ordered.length ? ordered : [...visibleFields];
}

export function loadSort(collection) {
  try {
    const raw = localStorage.getItem(sortKey(collection));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const field = parsed.field ? String(parsed.field) : null;
    const dir = parsed.dir === 'desc' ? 'desc' : parsed.dir === 'asc' ? 'asc' : null;
    if (!field || !dir) return null;
    return { field, dir };
  } catch {
    return null;
  }
}

export function saveSort(collection, sort) {
  try {
    if (!sort?.field || !sort?.dir) {
      localStorage.removeItem(sortKey(collection));
      return;
    }
    localStorage.setItem(sortKey(collection), JSON.stringify({ field: sort.field, dir: sort.dir }));
  } catch {
    /* ignore */
  }
}

function cellSortValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value).trim();
  const asNum = Number(str.replace(',', '.'));
  if (str !== '' && Number.isFinite(asNum) && /^-?\d+([.,]\d+)?$/.test(str)) {
    return asNum;
  }
  const asDate = Date.parse(str);
  if (!Number.isNaN(asDate) && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(str)) {
    return asDate;
  }
  return str.toLocaleLowerCase('pt-BR');
}

export function sortRows(rows, sort) {
  if (!sort?.field || !sort?.dir || !Array.isArray(rows)) return rows;
  const { field, dir } = sort;
  const mult = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = cellSortValue(a?.[field]);
    const vb = cellSortValue(b?.[field]);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * mult;
    }
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * mult;
  });
}

/** Cycle: none → asc → desc → none */
export function nextSortState(current, field) {
  if (!current || current.field !== field) return { field, dir: 'asc' };
  if (current.dir === 'asc') return { field, dir: 'desc' };
  return null;
}
