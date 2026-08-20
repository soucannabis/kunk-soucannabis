'use strict';

const LIVE_PREFIX = 'kunk_live_';
const PREFIX_TAIL = 12;

function apiTokenLookupPrefix(token) {
  const raw = String(token || '');
  if (!raw.startsWith(LIVE_PREFIX)) return null;
  const rest = raw.slice(LIVE_PREFIX.length);
  if (rest.length < PREFIX_TAIL) return null;
  return LIVE_PREFIX + rest.slice(0, PREFIX_TAIL);
}

module.exports = { LIVE_PREFIX, PREFIX_TAIL, apiTokenLookupPrefix };
