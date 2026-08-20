/**
 * After signing, only send the user back to official registration/kunk origins
 * (or a relative path on the registration host).
 */

const HTTP = new Set(['http:', 'https:']);

export function originOf(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!HTTP.has(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function originsFromEnv(env = {}) {
  const origins = [];
  for (const key of ['VITE_REGISTRATION_URL', 'VITE_KUNK_URL', 'VITE_KUNK_PUBLIC_URL']) {
    const origin = originOf(env[key]);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

export function resolveReturnUrl(raw, { allowedOrigins = [], registrationOrigin = null } = {}) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (value.startsWith('/') && !value.startsWith('//')) {
    if (!registrationOrigin) return null;
    try {
      const url = new URL(value, registrationOrigin);
      if (!HTTP.has(url.protocol) || url.origin !== registrationOrigin) return null;
      if (url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    if (!HTTP.has(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (!allowedOrigins.includes(url.origin)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function resolveReturnUrlFromSearch(search, env = {}) {
  const query = String(search || '');
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  return resolveReturnUrl(params.get('return_url'), {
    allowedOrigins: originsFromEnv(env),
    registrationOrigin: originOf(env.VITE_REGISTRATION_URL),
  });
}
