'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok } = require('../../utils/response');
const geoClient = require('../../services/geoapify/client');
const validateAddress = require('../../services/geoapify/validateAddress');
const credentialsService = require('../../services/credentialsService');

const router = Router();

/**
 * Setup / teste / status ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/status', async (req, res, next) => {
  try {
    const data = await validateAddress.getValidationStatus();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const creds = await credentialsService.resolveAll('geoapify');
    await geoClient.testConnection(creds);
    await credentialsService.markTestResult('geoapify', true);
    res.json(ok({ ok: true }));
  } catch (err) {
    await credentialsService.markTestResult('geoapify', false).catch(() => {});
    next(err);
  }
});

// Validação de endereço no fluxo de pedidos exige módulo ativo no Admin.
router.use(requireModule('geoapify'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'geoapify', status: 'enabled' }));
});

router.post('/validate-address', async (req, res, next) => {
  try {
    const data = await validateAddress.validateAddress(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
