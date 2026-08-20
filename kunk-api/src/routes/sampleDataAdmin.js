'use strict';

const { Router } = require('express');
const sampleDataService = require('../services/sampleDataService');
const { ok } = require('../utils/response');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(ok(await sampleDataService.getSummary()));
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const actorUserId = req.user?.id ?? null;
    res.json(ok(await sampleDataService.deleteSampleData({ actorUserId })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
