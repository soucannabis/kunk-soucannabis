'use strict';

/**
 * Normalize values for equality (Dates, JSON, numeric strings from pg).
 */
function normalizeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalizeValue(value[key]);
    }
    return out;
  }
  return value;
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null && b == null) return true;
  try {
    return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
  } catch {
    return false;
  }
}

/**
 * Build payload with only fields that changed between before → after.
 * Always includes `alwaysInclude` keys from after (e.g. primary key).
 */
function diffChangedFields(before, after, { alwaysInclude = [] } = {}) {
  const out = {};
  if (!after || typeof after !== 'object' || Array.isArray(after)) return out;

  const beforeObj = before && typeof before === 'object' && !Array.isArray(before) ? before : {};
  const include = new Set(alwaysInclude.filter(Boolean));

  for (const key of include) {
    if (Object.prototype.hasOwnProperty.call(after, key)) {
      out[key] = after[key];
    }
  }

  for (const [key, value] of Object.entries(after)) {
    if (include.has(key)) continue;
    if (!valuesEqual(beforeObj[key], value)) {
      out[key] = value;
    }
  }

  return out;
}

function hasMeaningfulChanges(changed, alwaysInclude = []) {
  const include = new Set(alwaysInclude.filter(Boolean));
  return Object.keys(changed || {}).some((k) => !include.has(k));
}

module.exports = {
  normalizeValue,
  valuesEqual,
  diffChangedFields,
  hasMeaningfulChanges,
};
