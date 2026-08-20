'use strict';

const { Router } = require('express');
const systemErrorsService = require('../services/systemErrorsService');
const { ok } = require('../utils/response');

const router = Router();

router.get('/summary', async (req, res, next) => {
  try {
    res.json(ok(await systemErrorsService.summary()));
  } catch (err) {
    next(err);
  }
});

router.get('/top', async (req, res, next) => {
  try {
    const period = req.query.period || '30d';
    const limit = req.query.limit;
    const openOnly = req.query.open !== '0' && req.query.open !== 'false';
    const rows = await systemErrorsService.top({ period, limit, openOnly });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await systemErrorsService.list({
      limit: req.query.limit,
      offset: req.query.offset,
      error_hash: req.query.error_hash || null,
      source: req.query.source || null,
      period: req.query.period || null,
    });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/:errorHash/samples', async (req, res, next) => {
  try {
    const rows = await systemErrorsService.samplesForHash(req.params.errorHash, {
      limit: req.query.limit,
    });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.post('/resolve', async (req, res, next) => {
  try {
    const body = req.body || {};
    const user = req.user || null;
    const resolved_by =
      body.resolved_by ||
      user?.user_code ||
      user?.email ||
      (user?.id != null ? String(user.id) : null);
    const row = await systemErrorsService.resolve({
      error_hash: body.error_hash,
      status: body.status,
      note: body.note,
      resolved_by,
    });
    res.json(ok(row));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
