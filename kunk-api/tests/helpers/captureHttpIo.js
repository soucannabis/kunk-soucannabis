'use strict';

/**
 * Pré-carregado pelo roadmap (`node -r …`) quando KUNK_TEST_CAPTURE_IO=1.
 * Intercepta SuperAgent Request.end (Supertest estende Request) e emite
 * linhas `__KUNK_IO__{json}` no stdout para o relatório.
 */

if (process.env.KUNK_TEST_CAPTURE_IO !== '1') {
  module.exports = {};
} else {
  const SENSITIVE_KEY = /password|secret|token|authorization|cookie|session|api[_-]?key|private/i;
  const MAX_BODY = 8_000;

  function redact(value, depth = 0) {
    if (depth > 6) return '[…]';
    if (value == null) return value;
    if (typeof value === 'string') {
      if (value.length > 400) return `${value.slice(0, 400)}…`;
      return value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const sliced = value.slice(0, 15).map((v) => redact(v, depth + 1));
      if (value.length > 15) sliced.push(`…(+${value.length - 15} itens)`);
      return sliced;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = typeof v === 'string' && v.length ? '[redacted]' : v == null ? v : '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }

  function truncateJson(value) {
    const redacted = redact(value);
    let text;
    try {
      text = JSON.stringify(redacted);
    } catch {
      return { _error: 'não serializável' };
    }
    if (text.length <= MAX_BODY) return redacted;
    return { _truncated: true, preview: text.slice(0, MAX_BODY) };
  }

  function resolveRoute(req) {
    const candidates = [req.url, req.path, req.pathname, req._url];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length) {
        try {
          const u = new URL(c, 'http://local.test');
          return u.pathname + (u.search || '');
        } catch {
          return c;
        }
      }
    }
    return '?';
  }

  function resolveMethod(req) {
    const m = req.method || req._method;
    return typeof m === 'string' && m ? m.toUpperCase() : 'GET';
  }

  function emit(entry) {
    try {
      process.stdout.write(`__KUNK_IO__${JSON.stringify(entry)}\n`);
    } catch (e) {
      try {
        process.stdout.write(
          `__KUNK_IO__${JSON.stringify({
            method: entry.method,
            route: String(entry.route),
            status: entry.status,
            error: `emit: ${e.message}`,
          })}\n`,
        );
      } catch {
        /* ignore */
      }
    }
  }

  function captureFromRequest(req, err, res) {
    try {
      if (req.__kunkIoCaptured) return;
      req.__kunkIoCaptured = true;

      let payload = null;
      if (Object.prototype.hasOwnProperty.call(req, '_data') && req._data !== undefined) {
        payload = req._data;
      }

      const status =
        res && res.status != null ? res.status : err && err.status != null ? err.status : null;
      let responseBody = null;
      if (res) {
        if (res.body != null && typeof res.body === 'object' && Object.keys(res.body).length) {
          responseBody = res.body;
        } else if (typeof res.text === 'string' && res.text) {
          responseBody = res.text;
        }
      } else if (err && err.response) {
        responseBody = err.response.body || err.response.text;
      }

      const stack = new Error().stack || '';
      const setup = /helpers\/auth\.js|refreshSession/.test(stack);

      emit({
        method: resolveMethod(req),
        route: resolveRoute(req),
        payload: payload == null ? null : truncateJson(payload),
        status,
        response: responseBody == null ? null : truncateJson(responseBody),
        error: err && !res ? String(err.message || err).slice(0, 300) : null,
        setCookie: Boolean(res && res.headers && res.headers['set-cookie']),
        setup: Boolean(setup),
      });
    } catch {
      /* ignore */
    }
  }

  try {
    const superagent = require('superagent');
    const Proto = superagent.Request && superagent.Request.prototype;
    if (Proto && !Proto.__kunkIoPatched) {
      const origEnd = Proto.end;
      Proto.end = function kunkIoEnd(cb) {
        const req = this;
        return origEnd.call(this, function onEnd(err, res) {
          captureFromRequest(req, err, res);
          if (typeof cb === 'function') return cb.apply(this, arguments);
          return undefined;
        });
      };
      Proto.__kunkIoPatched = true;
    }
    module.exports = { patched: true };
  } catch (e) {
    module.exports = { patched: false, error: String(e.message || e) };
  }
}
