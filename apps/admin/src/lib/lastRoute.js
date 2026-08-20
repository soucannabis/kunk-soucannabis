const STORAGE_KEY = 'kunk_admin_last_route';

export function safeInternalPath(raw, fallback = '/home') {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.startsWith('/login') || raw.startsWith('/sem-permissao')) return fallback;
  return raw;
}

export function rememberAdminRoute(pathname, search = '') {
  const path = safeInternalPath(`${pathname || ''}${search || ''}`);
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    /* ignore */
  }
  return path;
}

export function readRememberedAdminRoute(fallback = '/home') {
  try {
    return safeInternalPath(sessionStorage.getItem(STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}
