'use strict';

const { Router } = require('express');
const { ok } = require('../utils/response');
const webhooks = require('../services/webhooks');
const { WEBHOOK_TABLES, WEBHOOK_ACTIONS, WEBHOOK_TABLE_LABELS, WEBHOOK_ACTION_LABELS } = require('../services/webhooks/catalog');

const router = Router();

router.get('/catalog', async (_req, res) => {
  res.json(
    ok({
      tables: WEBHOOK_TABLES.map((key) => ({ key, label: WEBHOOK_TABLE_LABELS[key] || key })),
      actions: WEBHOOK_ACTIONS.map((key) => ({ key, label: WEBHOOK_ACTION_LABELS[key] || key })),
    })
  );
});

router.get('/', async (_req, res, next) => {
  try {
    res.json(ok(await webhooks.listEndpoints()));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const created = await webhooks.createEndpoint(req.body || {});
    res.status(201).json(ok(created));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    res.json(ok(await webhooks.updateEndpoint(id, req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-secret', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    res.json(ok(await webhooks.rotateSecret(id)));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    res.json(ok(await webhooks.deleteEndpoint(id)));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await webhooks.runTestDelivery(id);
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/deliveries', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const limit = req.query.limit;
    const offset = req.query.offset;
    res.json(ok(await webhooks.listDeliveries(id, { limit, offset })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
