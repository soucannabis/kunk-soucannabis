'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok } = require('../../utils/response');
const meAuth = require('../../services/melhorenvio/auth');
const { createOAuthState, assertOAuthState } = require('../../services/oauthState');
const meQuote = require('../../services/melhorenvio/quote');
const meLabel = require('../../services/melhorenvio/label');
const credentialsService = require('../../services/credentialsService');

const router = Router();

/**
 * Setup / OAuth / teste ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/oauth/authorize', authorizeAdmin, async (req, res, next) => {
  try {
    const { oauthRedirectUri } = require('../../utils/publicApiUrl');
    await credentialsService.putCredentials(
      'melhorenvio',
      { redirect_uri: oauthRedirectUri('melhorenvio') },
      { runTest: false }
    );
    const url = await meAuth.buildAuthorizeUrl(createOAuthState('melhorenvio'));
    res.json(ok({ url }));
  } catch (err) {
    next(err);
  }
});

/** Browser callback is registered publicly on /modules (before authenticate). */
router.get('/oauth/callback', async (req, res, next) => {
  try {
    assertOAuthState('melhorenvio', req.query.state);
    const code = req.query.code;
    await meAuth.exchangeCode(code);
    res.json(ok({ ok: true }));
  } catch (err) {
    next(err);
  }
});

router.get('/oauth/status', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await meAuth.oauthStatus();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const { isModuleEnabled } = require('../../services/moduleFlags');
    const oauth = await meAuth.oauthStatus();
    res.json(ok({ module: 'melhorenvio', enabled: await isModuleEnabled('melhorenvio'), ...oauth }));
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const creds = await credentialsService.resolveAll('melhorenvio');
    await meAuth.testConnection(creds);
    await credentialsService.markTestResult('melhorenvio', true);
    res.json(ok({ ok: true }));
  } catch (err) {
    await credentialsService.markTestResult('melhorenvio', false).catch(() => {});
    next(err);
  }
});

// Catálogo (Admin / favoritos de frete) — setup, não exige módulo ativo no sistema.
router.get('/companies', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await meQuote.listCompanies();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/services', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await meQuote.listServices();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/service-options', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await meQuote.listServices();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

// Cotação / etiqueta / cancelamento exigem módulo ativo no Admin.
router.use(requireModule('melhorenvio'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'melhorenvio', status: 'enabled' }));
});

router.post('/quote', async (req, res, next) => {
  try {
    const data = await meQuote.quote(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/correios-quote', async (req, res, next) => {
  try {
    const data = await meQuote.quote(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/create-label', async (req, res, next) => {
  try {
    const data = await meLabel.createLabel(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', async (req, res, next) => {
  try {
    const data = await meLabel.cancelLabel(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/shipment-details', async (req, res, next) => {
  try {
    const id = req.body?.id || req.body?.shipment_id || req.body?.carrier_order_code;
    const data = await meLabel.getShipmentDetails(id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
