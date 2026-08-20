/**
 * Core Web Vitals HTTP reporter (no dependency on the `web-vitals` npm package).
 * Apps import `web-vitals` themselves and call createWebVitalSender / reportWebVital.
 */

function isLocalHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function buildPayload(metric, app) {
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigation_type: metric.navigationType,
    id: metric.id,
    app,
    url: typeof window !== 'undefined' ? window.location?.href || null : null,
    path: typeof window !== 'undefined' ? window.location?.pathname || null : null,
    connection_type:
      typeof navigator !== 'undefined' ? navigator.connection?.effectiveType || null : null,
    device_memory:
      typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number'
        ? navigator.deviceMemory
        : null,
  };
}

/**
 * Fire-and-forget POST. Never throws. Skips localhost.
 */
export async function reportWebVital(payload, { baseUrl } = {}) {
  try {
    if (isLocalHost()) return null;
    if (!payload?.name || payload.value == null) return null;
    const root = String(baseUrl || '').replace(/\/$/, '');
    if (!root) return null;
    await fetch(`${root}/web-vitals`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    return true;
  } catch {
    return null;
  }
}

/** Returns a (metric) => void sender for use with onLCP/onINP/… from `web-vitals`. */
export function createWebVitalSender({ app, baseUrl } = {}) {
  return (metric) => {
    void reportWebVital(buildPayload(metric, app), { baseUrl });
  };
}

export { isLocalHost as isWebVitalsLocalHost };
