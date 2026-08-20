'use strict';

const { Router } = require('express');
const { checkConnection } = require('../db/pool');
const { ok, fail } = require('../utils/response');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    let db = 'down';
    try {
      const up = await checkConnection();
      db = up ? 'up' : 'down';
    } catch {
      db = 'down';
    }
    const status = db === 'up' ? 200 : 503;
    if (status === 200) {
      return res.status(200).json(ok({ ok: true, db }));
    }
    return res.status(503).json(fail('INTERNAL_ERROR', 'Database unavailable', { db }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
