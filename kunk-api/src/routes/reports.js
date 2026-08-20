'use strict';

const { Router } = require('express');
const reportsService = require('../services/reportsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.post('/', authorize('reports', 'create'), async (req, res, next) => {
  try {
    const data = await reportsService.saveReport(req.body || {}, req.user);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/run', authorize('reports', 'read'), async (req, res, next) => {
  try {
    const data = await reportsService.runReport(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/favorite', authorize('reports', 'update'), async (req, res, next) => {
  try {
    const key = req.user?.email || req.user?.id;
    const data = await reportsService.toggleFavorite(req.params.id, key);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
