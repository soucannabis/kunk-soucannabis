'use strict';

const { Router } = require('express');
const analyticsService = require('../services/analyticsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/associates', authorize('reports', 'read'), async (req, res, next) => {
  try {
    const data = await analyticsService.getAssociatesAnalytics(req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/services', authorize('reports', 'read'), async (req, res, next) => {
  try {
    const data = await analyticsService.getServicesAnalytics(req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/orders', authorize('reports', 'read'), async (req, res, next) => {
  try {
    const data = await analyticsService.getOrdersAnalytics(req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/reception', authorize('reports', 'read'), async (req, res, next) => {
  try {
    const data = await analyticsService.getReceptionAnalytics(req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
