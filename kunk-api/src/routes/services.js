'use strict';

const { Router } = require('express');
const servicesService = require('../services/servicesService');
const servicesReportsService = require('../services/servicesReportsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/reports', authorize('services', 'read'), async (req, res, next) => {
  try {
    const data = await servicesReportsService.getReport(req.query, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

// read: staff (update via serviço) e profissional (só os próprios atendimentos)
router.post('/reports/validate', authorize('services', 'read'), async (req, res, next) => {
  try {
    const data = await servicesReportsService.validateBatch(req.body || {}, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/', authorize('services', 'read'), async (req, res, next) => {
  try {
    const result = await servicesService.list(req.query, { scopeFilter: req.scopeFilter });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/by-group/:bookingGroupCode', authorize('services', 'read'), async (req, res, next) => {
  try {
    const data = await servicesService.byGroup(req.params.bookingGroupCode);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/by-professional/:id', authorize('services', 'read'), async (req, res, next) => {
  try {
    const data = await servicesService.byProfessional(req.params.id, req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/exists', authorize('services', 'read'), async (req, res, next) => {
  try {
    const data = await servicesService.exists(req.query.associate_user_code, req.query.professional_id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('services', 'create'), async (req, res, next) => {
  try {
    const data = await servicesService.createServices(req.body || {}, req.user);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/schedule', authorize('services', 'update'), async (req, res, next) => {
  try {
    const data = await servicesService.scheduleEvent(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/schedule', authorize('services', 'update'), async (req, res, next) => {
  try {
    const data = await servicesService.cancelCalendarEvent(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/mark-paid', authorize('services', 'update'), async (req, res, next) => {
  try {
    const data = await servicesService.markPaidFromReceipt(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('services', 'update'), async (req, res, next) => {
  try {
    const data = await servicesService.updateService(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('services', 'delete'), async (req, res, next) => {
  try {
    await servicesService.deleteService(req.params.id);
    res.json(ok({ ok: true }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
