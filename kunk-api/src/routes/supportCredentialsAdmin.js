'use strict';

const { Router } = require('express');
const { ok } = require('../utils/response');
const supportCredentialsService = require('../services/supportCredentialsService');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(ok(await supportCredentialsService.getSupportCredentials()));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = await supportCredentialsService.createSupportCredentials(req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    res.json(ok(await supportCredentialsService.deleteSupportCredentials()));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
