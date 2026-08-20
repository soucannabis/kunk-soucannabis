'use strict';

const { Router } = require('express');
const webVitalsService = require('../services/webVitalsService');
const { ok } = require('../utils/response');

const router = Router();

router.get('/summary', async (req, res, next) => {
  try {
    res.json(
      ok(
        await webVitalsService.summary({
          period: req.query.period || '7d',
          app: req.query.app || null,
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/series', async (req, res, next) => {
  try {
    res.json(
      ok(
        await webVitalsService.series({
          period: req.query.period || '7d',
          name: req.query.name || 'LCP',
          app: req.query.app || null,
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/by-page', async (req, res, next) => {
  try {
    const rows = await webVitalsService.byPage({
      period: req.query.period || '7d',
      name: req.query.name || 'LCP',
      limit: req.query.limit,
      app: req.query.app || null,
    });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
