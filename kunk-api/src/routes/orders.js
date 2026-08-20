'use strict';

const { Router } = require('express');
const ordersService = require('../services/ordersService');
const { env } = require('../config/env');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok, AppError } = require('../utils/response');
const { skipPaymentLockFromBody } = require('../utils/paymentLockBypass');

const router = Router();
router.use(authenticate);

router.get('/', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const result = await ordersService.listOrders(req.query || {});
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/facets', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.facets(req.query || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/status-config', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.statusConfig();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/stats', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.stats();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const data = await ordersService.bulkAction(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('orders', 'create'), async (req, res, next) => {
  try {
    const data = await ordersService.createOrder(req.body || {}, req.user);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/by-user/:userCode', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.listByUser(req.params.userCode);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.getOrderDetails(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/files', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.listOrderFiles(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/files', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const fileId = req.body?.file_id || req.body?.fileId;
    if (!fileId) throw new AppError(400, 'VALIDATION_ERROR', 'file_id é obrigatório');
    const confirmPayment = req.body?.confirm_payment !== false;
    const data = await ordersService.attachOrderFile(req.params.id, fileId, { confirmPayment });
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/tracking', authorize('orders', 'read'), async (req, res, next) => {
  try {
    const data = await ordersService.getOrderTracking(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/details', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const data = await ordersService.updateOrderDetails(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const data = await ordersService.updateOrder(req.params.id, req.body || {}, req.user);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const skipPaymentLock = skipPaymentLockFromBody(body, env.nodeEnv);
    const options = { skipPaymentLock };
    if (skipPaymentLock) {
      options.source = 'test_bypass';
      options.external_payment_info = body.external_payment_info || {
        provider: 'manual',
        method: 'test_bypass',
        note: 'Teste: pagamento forçado pelo operador (bypass PAYMENT_LOCK SouCannabis)',
        paid_at: new Date().toISOString(),
        local_order_id: Number(req.params.id),
      };
    }
    const data = await ordersService.updateStatus(req.params.id, body.status, options);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/production', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const data = await ordersService.updateProduction(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payment', authorize('orders', 'update'), async (req, res, next) => {
  try {
    const data = await ordersService.registerPayment(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('orders', 'delete'), async (req, res, next) => {
  try {
    const data = await ordersService.deleteOrder(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
