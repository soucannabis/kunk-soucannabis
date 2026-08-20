'use strict';

const { Router } = require('express');
const systemErrorsService = require('../services/systemErrorsService');
const associateAuthRepository = require('../repositories/associateAuthRepository');
const { optionalAuthenticate } = require('../middleware/authenticate');
const { ok, AppError } = require('../utils/response');
const { checkRateLimit, requestIp } = require('../utils/rateLimit');

const router = Router();

async function attachOptionalAssociate(req) {
  if (req.user || !req.cookies?.associate_session) return;
  try {
    const row = await associateAuthRepository.resolveSessionRow(req.cookies.associate_session);
    if (row) req.associate = associateAuthRepository.publicAssociate(row);
  } catch {
    /* ignore invalid associate cookie on public ingest */
  }
}

function sessionUserCode(req) {
  const user = req.user || null;
  const associate = req.associate || null;
  return (
    user?.user_code ||
    user?.internal_code ||
    associate?.user_code ||
    (user?.id != null ? String(user.id) : null)
  );
}

router.post('/', optionalAuthenticate, async (req, res, next) => {
  try {
    await attachOptionalAssociate(req);
    const authed = Boolean(req.user || req.associate);
    const ip = requestIp(req);
    const rl = checkRateLimit(`system-errors:${ip}`, {
      limit: authed ? 30 : 10,
      windowMs: 60 * 1000,
    });
    if (!rl.ok) {
      throw new AppError(429, 'RATE_LIMITED', 'Muitos erros reportados. Aguarde um momento.');
    }

    const body = req.body || {};
    const row = await systemErrorsService.record({
      ...body,
      source: 'frontend',
      user_code: sessionUserCode(req),
      user_agent: body.user_agent || req.headers['user-agent'] || null,
      environment: body.environment || process.env.NODE_ENV || null,
    });

    res.status(201).json(ok({ id: row.id, error_hash: row.error_hash }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
