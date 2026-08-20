'use strict';

const { Router } = require('express');
const usersService = require('../services/usersService');
const usersImportService = require('../services/usersImportService');
const registrationService = require('../services/registrationService');
const { authenticate } = require('../middleware/authenticate');
const { requireAssociate } = require('../middleware/requireAssociate');
const { authorize } = require('../middleware/authorize');
const { ok } = require('../utils/response');
const { assertAuthEnumRateLimit } = require('../utils/rateLimit');

const router = Router();

router.get('/exists', async (req, res, next) => {
  try {
    assertAuthEnumRateLimit(req, 'users-exists');
    const data = await registrationService.usersExists(req.query.email);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/me', requireAssociate, async (req, res, next) => {
  try {
    const result = await registrationService.patchMe(req.associateRow, req.body || {});
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/me/patients', requireAssociate, async (req, res, next) => {
  try {
    const data = await registrationService.listMyPatients(req.associateRow);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/me/patients', requireAssociate, async (req, res, next) => {
  try {
    const result = await registrationService.createMyPatient(req.associateRow, req.body || {});
    res.status(201).json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.patch('/me/patients/:id', requireAssociate, async (req, res, next) => {
  try {
    const result = await registrationService.patchMyPatient(
      req.associateRow,
      req.params.id,
      req.body || {}
    );
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/me/documents/status', requireAssociate, async (req, res, next) => {
  try {
    const data = await registrationService.documentsStatus(req.associateRow);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/me/extras/status', requireAssociate, async (req, res, next) => {
  try {
    const data = await registrationService.extrasStatus(req.associateRow);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/me/advance', requireAssociate, async (req, res, next) => {
  try {
    const data = await registrationService.advance(req.associateRow);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/me/complete', requireAssociate, async (req, res, next) => {
  try {
    const data = await registrationService.complete(req.associateRow);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.use(authenticate);

router.get('/import/fields', authorize('users', 'create'), async (req, res, next) => {
  try {
    const data = usersImportService.listImportFields();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/import/validate', authorize('users', 'create'), async (req, res, next) => {
  try {
    const data = await usersImportService.validateImport(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/import', authorize('users', 'create'), async (req, res, next) => {
  try {
    const data = await usersImportService.importUsers(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/', authorize('users', 'read'), async (req, res, next) => {
  try {
    const result = await usersService.list(req.query, { scopeFilter: req.scopeFilter });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/search', authorize('users', 'read'), async (req, res, next) => {
  try {
    const data = await usersService.searchUsers(req.query.q);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/by-code/:user_code', authorize('users', 'read'), async (req, res, next) => {
  try {
    const data = await usersService.getByCode(req.params.user_code, req.query);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('users', 'create'), async (req, res, next) => {
  try {
    const body = { ...(req.body || {}), panel: true };
    const data = await usersService.createUser(body);
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('users', 'update'), async (req, res, next) => {
  try {
    const data = await usersService.updateUser(req.params.id, req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/make-associate', authorize('users', 'update'), async (req, res, next) => {
  try {
    const data = await usersService.makeAssociate(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('users', 'delete'), async (req, res, next) => {
  try {
    const data = await usersService.deleteUser(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/patients', authorize('users', 'read'), async (req, res, next) => {
  try {
    const data = await usersService.getPatients(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/patients', authorize('users', 'create'), async (req, res, next) => {
  try {
    const data = await usersService.createPatient(req.params.id, req.body || {});
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/patients/:patientId', authorize('users', 'update'), async (req, res, next) => {
  try {
    const data = await usersService.updatePatient(
      req.params.id,
      req.params.patientId,
      req.body || {}
    );
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/patients/:patientId', authorize('users', 'delete'), async (req, res, next) => {
  try {
    const data = await usersService.deletePatient(req.params.id, req.params.patientId);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', authorize('users', 'read'), async (req, res, next) => {
  try {
    const data = await usersService.getHistory(req.params.id);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/handbook', authorize('users', 'update'), async (req, res, next) => {
  try {
    const data = await usersService.updateHandbook(req.params.id, req.body?.handbook);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
