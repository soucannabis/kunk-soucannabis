'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { ok, AppError } = require('../../utils/response');
const utalkClient = require('../../services/utalk/client');
const credentialsService = require('../../services/credentialsService');
const { authorize, authorizeAdmin } = require('../../middleware/authorize');

const router = Router();

/**
 * Setup / teste / status ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/status', async (req, res, next) => {
  try {
    const { isModuleEnabled } = require('../../services/moduleFlags');
    const cfg = await utalkClient.resolveConfig();
    res.json(
      ok({
        module: 'utalk',
        enabled: await isModuleEnabled('utalk'),
        has_api_token: Boolean(cfg.api_token),
        has_organization_id: Boolean(cfg.organization_id),
        api_base_url: cfg.api_base_url,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const creds = await credentialsService.resolveAll('utalk');
    const result = await utalkClient.testConnection(creds);
    await credentialsService.markTestResult('utalk', true);
    res.json(ok(result));
  } catch (err) {
    await credentialsService.markTestResult('utalk', false).catch(() => {});
    next(err);
  }
});

// Transferência / chats exigem módulo ativo no Admin.
router.use(requireModule('utalk'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'utalk', status: 'enabled' }));
});

router.get('/chats/:id', authorize('reception', 'read'), async (req, res, next) => {
  try {
    const data = await utalkClient.getChat(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/transfer', authorize('reception', 'update'), async (req, res, next) => {
  try {
    const chatId = req.body?.chatId ?? req.body?.chat_id;
    if (chatId == null || String(chatId).trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'chatId é obrigatório');
    }
    const memberId =
      req.body?.memberId === undefined ? req.body?.member_id : req.body.memberId;
    const data = await utalkClient.transferChat(chatId, memberId ?? null);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
