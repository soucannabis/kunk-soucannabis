'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok } = require('../../utils/response');
const { LOGGI_SERVICE_CATALOG } = require('../../services/freightNormalize');
const loggiQuote = require('../../services/loggi/quote');
const loggiLabel = require('../../services/loggi/label');
const loggiClient = require('../../services/loggi/client');
const credentialsService = require('../../services/credentialsService');

const router = Router();

/**
 * Setup / teste / catálogo ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/status', async (req, res, next) => {
  try {
    const { isModuleEnabled } = require('../../services/moduleFlags');
    res.json(ok({ module: 'loggi', enabled: await isModuleEnabled('loggi') }));
  } catch (err) {
    next(err);
  }
});

router.get('/service-options', authorizeAdmin, (req, res) => {
  res.json(ok({ provider: 'loggi', options: LOGGI_SERVICE_CATALOG }));
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const creds = await credentialsService.resolveAll('loggi');
    await loggiClient.testConnection(creds);
    await credentialsService.markTestResult('loggi', true);
    res.json(ok({ ok: true }));
  } catch (err) {
    await credentialsService.markTestResult('loggi', false).catch(() => {});
    next(err);
  }
});

// Cotação / etiqueta exigem módulo ativo no Admin.
router.use(requireModule('loggi'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'loggi', status: 'enabled' }));
});

router.post('/quote-freight', async (req, res, next) => {
  try {
    const data = await loggiQuote.quoteFreight(req.body?.address || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/create-label', async (req, res, next) => {
  try {
    const data = await loggiLabel.createLabel(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', async (req, res, next) => {
  try {
    const data = await loggiLabel.cancelPackage(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/packages', async (req, res, next) => {
  try {
    const data = await loggiLabel.getPackages(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
