'use strict';

const { Router } = require('express');
const { ok } = require('../utils/response');
const systemHealthService = require('../services/systemHealthService');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(ok(await systemHealthService.getSystemHealth(req)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
