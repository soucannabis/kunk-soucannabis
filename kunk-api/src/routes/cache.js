'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/authenticate');
const cacheAdminService = require('../services/cacheAdminService');
const { ok } = require('../utils/response');

const router = Router();

router.use(authenticate);

/** Status para o app Kunk (operador autenticado). */
router.get('/status', async (req, res, next) => {
  try {
    const status = await cacheAdminService.getStatus();
    res.json(ok({ enabled: status.enabled }));
  } catch (err) {
    next(err);
  }
});

/** Limpeza nuclear (logo / operador). */
router.post('/clear', async (req, res, next) => {
  try {
    res.json(ok(await cacheAdminService.clear()));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
