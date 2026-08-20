'use strict';

const { Router } = require('express');
const activityService = require('../services/activityService');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ok, AppError } = require('../utils/response');

const router = Router();
router.use(authenticate);

function myCode(req) {
  return activityService.actorCode(req.user);
}

router.get('/', authorize('system_activity', 'read'), async (req, res, next) => {
  try {
    const result = await activityService.list({
      limit: req.query.limit,
      offset: req.query.offset,
      entity_type: req.query.entity_type,
      actor_user_code: req.query.actor_user_code,
      action: req.query.action,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ data: result.data, meta: result.meta, errors: null });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', authorize('system_activity', 'read'), async (req, res, next) => {
  try {
    const code = myCode(req);
    if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'usuário sem código');
    const unreadOnly = String(req.query.unread_only || '') === '1'
      || String(req.query.unread_only || '').toLowerCase() === 'true';
    const result = await activityService.listMine(code, {
      limit: req.query.limit,
      offset: req.query.offset,
      unread_only: unreadOnly,
    });
    res.json({ data: result.data, meta: result.meta, errors: null });
  } catch (err) {
    next(err);
  }
});

router.get('/mine/unread-count', authorize('system_activity', 'read'), async (req, res, next) => {
  try {
    const code = myCode(req);
    const count = await activityService.unreadCount(code);
    res.json(ok({ count }));
  } catch (err) {
    next(err);
  }
});

router.post('/mine/read', authorize('system_activity', 'read'), async (req, res, next) => {
  try {
    const code = myCode(req);
    if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'usuário sem código');
    const data = await activityService.markRead(code, {
      ids: req.body?.ids,
      all: Boolean(req.body?.all),
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
