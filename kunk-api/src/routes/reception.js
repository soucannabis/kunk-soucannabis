'use strict';

const { Router } = require('express');
const receptionService = require('../services/receptionService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok, AppError } = require('../utils/response');
const { assertAuthEnumRateLimit } = require('../utils/rateLimit');

const router = Router();

router.get('/form-schema', async (req, res, next) => {
  try {
    const data = await receptionService.getFormSchema();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/public', async (req, res, next) => {
  try {
    assertAuthEnumRateLimit(req, 'reception-public');
    const data = await receptionService.createPublicReception(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.use(authenticate);

router.get('/status-counts', authorize('reception', 'read'), async (req, res, next) => {
  try {
    const data = await receptionService.statusCounts();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/attendants', authorize('reception', 'read'), async (req, res, next) => {
  try {
    const data = await receptionService.listAttendants();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('reception', 'create'), async (req, res, next) => {
  try {
    const data = await receptionService.createReception(req.body || {}, req.user);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/utalk-sync-waiting', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.syncUtalkWaiting({
      concurrency: req.body?.concurrency,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/complete', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.complete(req.params.id, req.body?.completion_reason, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/attendant', authorize('reception', 'update'), async (req, res, next) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'attendant')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'attendant é obrigatório');
    }
    const data = await receptionService.assignAttendant(req.params.id, req.body.attendant, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/chat', authorize('reception', 'update'), async (req, res, next) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'chat_id')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'chat_id é obrigatório (use null para limpar)');
    }
    const data = await receptionService.setChatId(req.params.id, req.body.chat_id, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/utalk-sync', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.syncUtalk(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.updateStatus(req.params.id, req.body?.status, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/link', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.linkAssociate(req.params.id, req.body?.associate_code, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/unlink', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const data = await receptionService.unlinkAssociate(req.params.id, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
