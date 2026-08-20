'use strict';

const { Router } = require('express');
const professionalsService = require('../services/professionalsService');
const servicesReportsService = require('../services/servicesReportsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize, forbidPortalProfessional } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/', authorize('professionals', 'read'), async (req, res, next) => {
  try {
    const data = await professionalsService.list(req.query, { scopeFilter: req.scopeFilter });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authorize('professionals', 'read'), async (req, res, next) => {
  try {
    const data = await professionalsService.getById(req.params.id, { scopeFilter: req.scopeFilter });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/contest-reports', authorize('professionals', 'update'), async (req, res, next) => {
  try {
    const data = await servicesReportsService.appendContestReport(
      req.params.id,
      req.body || {},
      req.user
    );
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/:id/contest-reports/:index',
  authorize('professionals', 'update'),
  async (req, res, next) => {
    try {
      const data = await servicesReportsService.deleteContestReport(
        req.params.id,
        req.params.index,
        req.user
      );
      res.json(ok(data));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/', authorize('professionals', 'create'), async (req, res, next) => {
  try {
    const data = await professionalsService.create(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('professionals', 'update'), async (req, res, next) => {
  try {
    const data = await professionalsService.update(req.params.id, req.body || {}, {
      scopeFilter: req.scopeFilter,
      roles: req.user?.roles || req.user?.permissions,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('professionals', 'delete'), async (req, res, next) => {
  try {
    const data = await professionalsService.softDelete(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/donation-balance',
  authorize('professionals', 'update'),
  forbidPortalProfessional,
  async (req, res, next) => {
    try {
      const data = await professionalsService.updateDonationBalance(
        req.params.id,
        req.body?.donation_balance
      );
      res.json(ok(data));
    } catch (err) {
      next(err);
    }
  }
);

const professionalPortalAccess = require('../services/professionalPortalAccess');

router.post(
  '/:id/portal-access',
  authorize('professionals', 'update'),
  forbidPortalProfessional,
  async (req, res, next) => {
    try {
      const data = await professionalPortalAccess.createPortalAccess(req.params.id);
      res.status(201).json(ok(data));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/portal-access/resend',
  authorize('professionals', 'update'),
  forbidPortalProfessional,
  async (req, res, next) => {
    try {
      const data = await professionalPortalAccess.resendPortalAccess(req.params.id);
      res.json(ok(data));
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
