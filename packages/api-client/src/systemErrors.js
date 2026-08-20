/**
 * Client-side system error reporting for kunk-api POST /system-errors.
 */

const DEDUPE_MS = 60_000;
const recentHashes = new Map();

function isApiError(err) {
  return Boolean(err && err.name === 'ApiError' && typeof err.status === 'number');
}

function isLocalHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function simpleHash(parts) {
  const raw = parts.join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}

function shouldDedupe(key) {
  const now = Date.now();
  for (const [k, t] of recentHashes.entries()) {
    if (now - t > DEDUPE_MS) recentHashes.delete(k);
  }
  if (recentHashes.has(key)) return true;
  recentHashes.set(key, now);
  return false;
}

export function shouldReportApiError(err) {
  if (!err) return false;
  if (isApiError(err)) {
    return err.status >= 500 || err.code === 'INTERNAL_ERROR';
  }
  if (err.name === 'AbortError') return false;
  return err instanceof Error;
}

export function payloadFromError(err, { app, source = 'frontend' } = {}) {
  const message =
    (err && err.message) ||
    (typeof err === 'string' ? err : 'Erro inesperado');
  const stack = err?.stack || null;
  let file_name = null;
  let lineno = null;
  let colno = null;
  if (stack) {
    const line = String(stack)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at ') && !l.includes('node_modules'));
    if (line) {
      const m = line.match(/\((.+):(\d+):(\d+)\)$/) || line.match(/at (.+):(\d+):(\d+)$/);
      if (m) {
        file_name = m[1];
        lineno = Number(m[2]) || null;
        colno = Number(m[3]) || null;
      }
    }
  }
  return {
    source,
    app: app || null,
    severity: 'error',
    message: String(message).slice(0, 2000),
    code: err?.code || 'FRONTEND_ERROR',
    file_name,
    lineno,
    colno,
    stack_trace: stack ? String(stack).slice(0, 8000) : null,
    url: typeof window !== 'undefined' ? window.location?.href || null : null,
    status_code: isApiError(err) ? err.status : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    environment:
      typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE
        ? import.meta.env.MODE
        : null,
  };
}

/**
 * Fire-and-forget POST to /system-errors. Never throws.
 */
export async function reportSystemError(payload, { baseUrl } = {}) {
  try {
    if (isLocalHost()) return null;
    const body = {
      source: 'frontend',
      ...payload,
    };
    if (!body.message) return null;
    const dedupeKey = simpleHash([
      body.message,
      body.file_name || '',
      body.lineno == null ? '' : String(body.lineno),
      body.code || '',
      body.source || '',
      body.app || '',
    ]);
    if (shouldDedupe(dedupeKey)) return null;

    const root = String(baseUrl || '').replace(/\/$/, '');
    if (!root) return null;

    await fetch(`${root}/system-errors`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    return true;
  } catch {
    return null;
  }
}

/**
 * Install window error + unhandledrejection listeners once per app.
 */
export function installGlobalErrorListeners({ app, baseUrl }) {
  if (typeof window === 'undefined') return () => {};
  if (window.__kunkSystemErrorsInstalled) return () => {};
  window.__kunkSystemErrorsInstalled = true;

  function report(partial) {
    void reportSystemError(
      {
        app,
        source: 'frontend',
        ...partial,
      },
      { baseUrl },
    );
  }

  const onError = (event) => {
    report({
      message: event.error?.message || String(event.message || 'window.onerror'),
      stack_trace: event.error?.stack || null,
      file_name: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      code: 'WINDOW_ONERROR',
      url: window.location?.href || null,
      user_agent: navigator.userAgent,
    });
  };

  const onRejection = (event) => {
    const reason = event?.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason || 'unhandledrejection'));
    if (isApiError(reason) && reason.status < 500 && reason.code !== 'INTERNAL_ERROR') {
      return;
    }
    report(payloadFromError(err, { app }));
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.__kunkSystemErrorsInstalled = false;
  };
}
