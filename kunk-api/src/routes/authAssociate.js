'use strict';

const { Router } = require('express');
const associateAuthRepository = require('../repositories/associateAuthRepository');
const { requireAssociate } = require('../middleware/requireAssociate');
const { ok } = require('../utils/response');
const { env } = require('../config/env');
const { assertAuthEnumRateLimit, assertLoginRateLimit, recordLoginFailure, checkRateLimit, requestIp } = require('../utils/rateLimit');

const router = Router();

function setAssociateCookie(res, sessionToken, expires) {
  res.cookie('associate_session', sessionToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionMaxHours * 3600 * 1000,
    expires,
  });
}

function clearAssociateCookie(res) {
  res.cookie('associate_session', '', {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

router.post('/register-email', async (req, res, next) => {
  try {
    assertAuthEnumRateLimit(req, 'assoc-register');
    const { email, password } = req.body || {};
    const { user, sessionToken, expires } = await associateAuthRepository.registerEmail(email, password);
    setAssociateCookie(res, sessionToken, expires);
    res.status(201).json(ok({ user }));
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  try {
    assertLoginRateLimit(req, 'assoc-login', email);
    const { password } = req.body || {};
    const { user, sessionToken, expires } = await associateAuthRepository.login(email, password);
    setAssociateCookie(res, sessionToken, expires);
    res.json(ok({ user }));
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      recordLoginFailure(req, 'assoc-login', email);
    }
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await associateAuthRepository.logout(req.cookies?.associate_session);
    clearAssociateCookie(res);
    res.json(ok({ ok: true }));
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAssociate, async (req, res) => {
  res.json(ok({ user: req.associate }));
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { AppError } = require('../utils/response');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = requestIp(req);
    const limited = checkRateLimit(`assoc-forgot:${ip}:${email}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      throw new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.');
    }
    const data = await associateAuthRepository.forgotPassword(req.body?.email);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const data = await associateAuthRepository.resetPassword(token, password);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
