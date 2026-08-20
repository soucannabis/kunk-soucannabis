'use strict';

const { Router } = require('express');
const webVitalsService = require('../services/webVitalsService');
const { ok, AppError } = require('../utils/response');
const { checkRateLimit } = require('../utils/rateLimit');

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const rl = checkRateLimit(`web-vitals:${ip}`, { limit: 120, windowMs: 60 * 1000 });
    if (!rl.ok) {
      throw new AppError(429, 'RATE_LIMITED', 'Muitas métricas enviadas. Aguarde um momento.');
    }

    const body = req.body;
    const user = req.user || null;
    const userCode =
      user?.user_code ||
      user?.internal_code ||
      (user?.id != null ? String(user.id) : null);
    const userAgent = req.headers['user-agent'] || null;

    const enrich = (item) => ({
      ...item,
      user_code: item.user_code || userCode,
      user_agent: item.user_agent || userAgent,
    });

    if (Array.isArray(body)) {
      const rows = await webVitalsService.recordMany(body.map(enrich));
      return res.status(201).json(ok({ count: rows.length, ids: rows.map((r) => r.id) }));
    }

    const row = await webVitalsService.record(enrich(body || {}));
    res.status(201).json(ok({ id: row.id, name: row.name }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
