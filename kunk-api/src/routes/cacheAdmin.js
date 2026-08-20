'use strict';

const { Router } = require('express');
const cacheAdminService = require('../services/cacheAdminService');
const { ok } = require('../utils/response');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(ok(await cacheAdminService.getStatus()));
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    res.json(ok(await cacheAdminService.setEnabled(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/clear', async (req, res, next) => {
  try {
    res.json(ok(await cacheAdminService.clear()));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
