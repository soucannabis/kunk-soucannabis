'use strict';

const { Router } = require('express');
const { ok, AppError } = require('../../utils/response');
const { authenticate } = require('../../middleware/authenticate');
const { requireRole } = require('../../middleware/authorize');
const ciap2Config = require('../../services/ciap2Config');

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const data = await ciap2Config.getStatus();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/', authenticate, requireRole('Administrador'), async (req, res, next) => {
  try {
    if (req.body?.enabled === undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Campo enabled é obrigatório');
    }
    const data = await ciap2Config.setEnabled(Boolean(req.body.enabled));
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
