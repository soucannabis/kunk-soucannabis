'use strict';

const { Router } = require('express');
const tagsService = require('../services/tagsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/', authorize('tags', 'read'), async (req, res, next) => {
  try {
    const data = await tagsService.listByContext(req.query.contexts);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
