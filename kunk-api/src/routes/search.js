'use strict';

const { Router } = require('express');
const searchService = require('../services/searchService');
const { authenticate } = require('../middleware/authenticate');
const { assertCan } = require('../middleware/authorize');
const { AppError, ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const entity = String(req.query.entity || 'users').toLowerCase();
    if (!searchService.ENTITIES.has(entity)) {
      throw new AppError(400, 'VALIDATION_ERROR', `entity inválida: ${entity}`);
    }
    assertCan(req, entity, 'read');
    const result = await searchService.globalSearch(req.query, { scopeFilter: req.scopeFilter });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
