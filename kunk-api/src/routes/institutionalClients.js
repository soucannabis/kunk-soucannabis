'use strict';

const { Router } = require('express');
const institutionalClientsService = require('../services/institutionalClientsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/', authorize('institutional_clients', 'read'), async (req, res, next) => {
  try {
    const result = await institutionalClientsService.list(req.query, { scopeFilter: req.scopeFilter });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/search', authorize('institutional_clients', 'read'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.search(req.query.q);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/by-code/:client_code', authorize('institutional_clients', 'read'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.getByCode(req.params.client_code);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', authorize('institutional_clients', 'read'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.getHistory(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authorize('institutional_clients', 'read'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.getById(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('institutional_clients', 'create'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.create(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('institutional_clients', 'update'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.update(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('institutional_clients', 'delete'), async (req, res, next) => {
  try {
    const data = await institutionalClientsService.remove(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
