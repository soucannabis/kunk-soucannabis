'use strict';

const { Router } = require('express');
const freightService = require('../services/freightService');
const { authenticate } = require('../middleware/authenticate');
const { AppError, ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

const CART_ROLES = new Set(['Administrador', 'Acolhimento', 'Produção']);

function requireCartRole(req, res, next) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária');
    const roles = req.user.roles || req.user.permissions || [];
    if (!roles.some((r) => CART_ROLES.has(r))) {
      throw new AppError(403, 'FORBIDDEN', 'Role de loja necessária');
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.post('/quote', requireCartRole, async (req, res, next) => {
  try {
    const address = req.body?.address || req.body || {};
    const data = await freightService.quoteAll(address);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/quote-availability', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.getQuoteAvailability();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/label-availability', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.getLabelAvailability();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/tracking-availability', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.getTrackingAvailability();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/service-options', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.getServiceOptions();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/default-option', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.getDefaultOption();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.put('/default-option', requireCartRole, async (req, res, next) => {
  try {
    const data = await freightService.setDefaultOption(
      req.body?.default_option || req.body,
      req.user
    );
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
