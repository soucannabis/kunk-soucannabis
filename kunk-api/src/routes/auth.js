'use strict';

const { Router } = require('express');
const authRepository = require('../repositories/authRepository');
const authAssociate = require('./authAssociate');
const { authenticate } = require('../middleware/authenticate');
const { authorizeAdmin } = require('../middleware/authorize');
const { ok } = require('../utils/response');
const { env } = require('../config/env');
const { assertLoginRateLimit, recordLoginFailure, checkRateLimit, requestIp } = require('../utils/rateLimit');
const {
  LEGACY_OPERATOR_SESSION_COOKIE,
  operatorCookieName,
  resolveOperatorApp,
  extractOperatorCookieToken,
} = require('../constants/authCookies');

const router = Router();

function cookieOpts(extra = {}) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    ...extra,
  };
}

function clearLegacyOperatorCookie(res) {
  res.cookie(LEGACY_OPERATOR_SESSION_COOKIE, '', cookieOpts({ maxAge: 0 }));
}

router.use('/associate', authAssociate);

router.post('/login', async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  try {
    assertLoginRateLimit(req, 'op-login', email);
    const { password } = req.body || {};
    const app = resolveOperatorApp(req, { required: true });
    const { user, sessionToken, expires } = await authRepository.login(email, password, app);
    const cookieName = operatorCookieName(app);
    res.cookie(cookieName, sessionToken, cookieOpts({
      maxAge: env.sessionMaxHours * 3600 * 1000,
      expires,
    }));
    clearLegacyOperatorCookie(res);
    res.json(ok({ user }));
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      recordLoginFailure(req, 'op-login', email);
    }
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = requestIp(req);
    const limited = checkRateLimit(`op-forgot:${ip}:${email}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      const { AppError } = require('../utils/response');
      throw new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.');
    }
    const data = await authRepository.forgotPassword(email, req.body?.app);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const data = await authRepository.resetPassword(req.body?.token, req.body?.password);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const app = resolveOperatorApp(req);
    const token = extractOperatorCookieToken(req, app);
    await authRepository.logout(token);
    if (app) {
      const cookieName = operatorCookieName(app);
      if (cookieName) res.cookie(cookieName, '', cookieOpts({ maxAge: 0 }));
    } else if (token) {
      // Sem app: limpa o cookie cujo valor bateu no scan
      const {
        KNOWN_OPERATOR_APPS,
        OPERATOR_COOKIE_BY_APP,
      } = require('../constants/authCookies');
      for (const known of KNOWN_OPERATOR_APPS) {
        const name = OPERATOR_COOKIE_BY_APP[known];
        if (req.cookies?.[name] === token) {
          res.cookie(name, '', cookieOpts({ maxAge: 0 }));
        }
      }
    }
    clearLegacyOperatorCookie(res);
    res.json(ok({ ok: true }));
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { query } = require('../db/pool');
    let rolePages = null;
    try {
      const result = await query(
        `SELECT value FROM system_configs WHERE system = 'kunk' AND key = 'role_pages' LIMIT 1`
      );
      const raw = result.rows[0]?.value;
      if (raw) rolePages = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      rolePages = null;
    }
    res.json(ok({ user: req.user, role_pages: rolePages }));
  } catch (err) {
    next(err);
  }
});

async function requireApiAccessEnabled(req, res, next) {
  try {
    const systemConfigService = require('../services/systemConfigService');
    const { AppError } = require('../utils/response');
    const enabled = await systemConfigService.isApiAccessEnabled();
    if (!enabled) {
      throw new AppError(403, 'API_DISABLED', 'Acesso via API está desabilitado');
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.post('/tokens', authenticate, authorizeAdmin, requireApiAccessEnabled, async (req, res, next) => {
  try {
    const { email, label, scopes } = req.body || {};
    const token = await authRepository.createApiToken({ email, label, scopes });
    res.status(201).json(ok(token));
  } catch (err) {
    next(err);
  }
});

router.get('/tokens', authenticate, authorizeAdmin, requireApiAccessEnabled, async (req, res, next) => {
  try {
    const tokens = await authRepository.listApiTokens();
    res.json(ok(tokens));
  } catch (err) {
    next(err);
  }
});

router.patch('/tokens/:id', authenticate, authorizeAdmin, requireApiAccessEnabled, async (req, res, next) => {
  try {
    const { email, label, scopes } = req.body || {};
    const token = await authRepository.updateApiToken(req.params.id, { email, label, scopes });
    res.json(ok(token));
  } catch (err) {
    next(err);
  }
});

router.delete('/tokens/:id', authenticate, authorizeAdmin, requireApiAccessEnabled, async (req, res, next) => {
  try {
    const result = await authRepository.revokeApiToken(req.params.id);
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

const professionalPortalAccess = require('../services/professionalPortalAccess');
const systemInviteService = require('../services/systemInviteService');

router.get('/system-invite/preview', async (req, res, next) => {
  try {
    const data = await systemInviteService.previewInvite(req.query.token);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/system-invite/accept', async (req, res, next) => {
  try {
    const data = await systemInviteService.acceptInvite(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

const installService = require('../services/installService');

router.get('/install-status', async (req, res, next) => {
  try {
    const data = await installService.getInstallStatus();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/install-schema', async (req, res, next) => {
  try {
    const data = await installService.applySchema();
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/install', async (req, res, next) => {
  try {
    const data = await installService.runInstall(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/install-sample', async (req, res, next) => {
  try {
    const data = await installService.seedDemoSample();
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
