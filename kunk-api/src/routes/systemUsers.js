'use strict';

const { Router } = require('express');
const systemUsersService = require('../services/systemUsersService');
const { authenticate } = require('../middleware/authenticate');
const { authorizeAdmin, authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');

const router = Router();
router.use(authenticate);

router.get('/', authorize('system_users', 'read'), async (req, res, next) => {
  try {
    const data = await systemUsersService.listSystemUsers();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorizeAdmin, async (req, res, next) => {
  try {
    const systemInviteService = require('../services/systemInviteService');
    const body = { ...(req.body || {}) };
    delete body.password;
    const data = await systemInviteService.inviteOperator(body);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resend-invite', authorizeAdmin, async (req, res, next) => {
  try {
    const systemInviteService = require('../services/systemInviteService');
    const data = await systemInviteService.resendOperatorInvite(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authorize('system_users', 'read'), async (req, res, next) => {
  try {
    const data = await systemUsersService.getSystemUser(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await systemUsersService.updateSystemUser(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await systemUsersService.deleteSystemUser(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
