'use strict';

const { Router } = require('express');
const { ok, fail } = require('../utils/response');
const systemConfigService = require('../services/systemConfigService');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const professionalTypesConfig = require('../services/professionalTypesConfig');

const router = Router();

/**
 * GET /config/public?system=registration
 * Public branding/config (non-sensitive only). Cascade: DB → env → hardcoded.
 */
router.get('/public', async (req, res, next) => {
  try {
    const system = String(req.query.system || '').trim();
    if (!system) {
      return res.status(400).json(fail('VALIDATION_ERROR', 'Query system é obrigatória'));
    }
    const payload = await systemConfigService.resolvePublic(system);
    return res.status(200).json(ok(payload));
  } catch (err) {
    next(err);
  }
});

const admin = [authenticate, requireRole('Administrador')];
const anyAuth = [authenticate];

/** Tipos de profissional — leitura autenticada; escrita admin */
router.get('/services/professional-types', ...anyAuth, async (req, res, next) => {
  try {
    const data = await professionalTypesConfig.loadProfessionalTypes();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.put('/services/professional-types', ...admin, async (req, res, next) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body?.types;
    const data = await professionalTypesConfig.saveProfessionalTypes(list);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/services/report-settings', ...anyAuth, async (req, res, next) => {
  try {
    const data = await professionalTypesConfig.loadReportSettings();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.put('/services/report-settings', ...admin, async (req, res, next) => {
  try {
    const data = await professionalTypesConfig.saveReportSettings(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/systems', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.listSystems();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/', ...admin, async (req, res, next) => {
  try {
    const system = String(req.query.system || '').trim();
    if (!system) {
      return res.status(400).json(fail('VALIDATION_ERROR', 'Query system é obrigatória'));
    }
    const items = await systemConfigService.listAdminBySystem(system);
    res.json(ok({ system, items }));
  } catch (err) {
    next(err);
  }
});

router.post('/', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.createConfig(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.getAdminById(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.updateConfig(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.deleteConfig(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/clear', ...admin, async (req, res, next) => {
  try {
    const data = await systemConfigService.clearConfigValue(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
