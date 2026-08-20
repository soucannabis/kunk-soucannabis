'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok } = require('../../utils/response');
const pagarme = require('../../services/pagarme');

const router = Router();

/**
 * Rotas de setup/validação ficam FORA do requireModule.
 * Setup (auth, test-payment, validate) fica fora de requireModule.
 * Setup exige Administrador; status e checkout permanecem para a loja.
 */
router.get('/status', async (req, res, next) => {
  try {
    res.json(ok(await pagarme.getStatus(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/webhooks/status', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.getWebhooksStatus(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks/validate', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.validateWebhooks(req, { persist: true })));
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks/test-payment', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.createTestPaymentLink()));
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks/ensure', authorizeAdmin, async (req, res, next) => {
  try {
    const generateAuth = req.body?.generate_auth !== false;
    res.json(ok(await pagarme.ensureWebhooks(req, { generateAuth })));
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const credentialsService = require('../../services/credentialsService');
    const creds = await credentialsService.resolveAll('pagarme');
    await pagarme.testConnection(creds);
    await credentialsService.markTestResult('pagarme', true);
    res.json(ok({ ok: true, is_psp: true }));
  } catch (err) {
    const credentialsService = require('../../services/credentialsService');
    await credentialsService.markTestResult('pagarme', false).catch(() => {});
    next(err);
  }
});

// Checkout / recipients / proxy de entregas exigem módulo efetivamente ativo.
router.use(requireModule('pagarme'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'pagarme', status: 'enabled' }));
});

router.get('/webhooks', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await pagarme.listHooks({
      status: req.query.status,
      webhook_event: req.query.webhook_event || 'order.paid',
      created_since: req.query.created_since,
      created_until: req.query.created_until,
      page: req.query.page || 1,
      size: req.query.size || 20,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/webhooks/:hookId', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.getHook(req.params.hookId)));
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks/:hookId/retry', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.retryHook(req.params.hookId)));
  } catch (err) {
    next(err);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    res.json(ok(await pagarme.createCheckout(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/recipients', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await pagarme.createRecipient(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/recipients/association', authorizeAdmin, async (req, res, next) => {
  try {
    const force = Boolean(req.body?.force);
    const body = { ...(req.body || {}) };
    delete body.force;
    res.json(ok(await pagarme.createAssociationRecipient(body, { force })));
  } catch (err) {
    next(err);
  }
});

router.post('/recipients/soucannabis', authorizeAdmin, async (req, res, next) => {
  try {
    const force = Boolean(req.body?.force);
    const body = { ...(req.body || {}) };
    delete body.force;
    res.json(ok(await pagarme.createSoucannabisRecipient(body, { force })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
