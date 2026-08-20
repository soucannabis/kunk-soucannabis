'use strict';

const { Router } = require('express');
const productsService = require('../services/productsService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/export.csv', authorize('products', 'read'), async (req, res, next) => {
  try {
    const csv = await productsService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="produtos.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.post('/import/validate', authorize('products', 'create'), async (req, res, next) => {
  try {
    const data = await productsService.validateImport(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/import', authorize('products', 'create'), async (req, res, next) => {
  try {
    const data = await productsService.importProducts(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/movements', authorize('products', 'read'), async (req, res, next) => {
  try {
    const data = await productsService.listMovements(req.params.id, req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/stock', authorize('products', 'update'), async (req, res, next) => {
  try {
    const data = await productsService.adjustStock(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/batch', authorize('products', 'update'), async (req, res, next) => {
  try {
    const data = await productsService.updateBatch(req.params.id, req.body?.batch);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/sync-batches', authorize('products', 'update'), async (req, res, next) => {
  try {
    const data = await productsService.syncBatches(req.body?.items || []);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
