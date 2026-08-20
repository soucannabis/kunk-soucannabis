'use strict';

const { Router } = require('express');
const storageAdminService = require('../services/storageAdminService');
const backupService = require('../services/backupService');
const { beforeBackupRoutes } = require('../middleware/ensureBackupSchema');
const { ok } = require('../utils/response');

const router = Router();

router.use(beforeBackupRoutes);

router.get('/', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.getStatus()));
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.saveConfig(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.testConnection(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/activate', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.activate(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.get('/branding-migration', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.listBrandingMigrationStatus()));
  } catch (err) {
    next(err);
  }
});

router.post('/migrate-branding', async (req, res, next) => {
  try {
    res.json(ok(await storageAdminService.migrateBrandingAssets()));
  } catch (err) {
    next(err);
  }
});

router.get('/backups', async (req, res, next) => {
  try {
    const status = await storageAdminService.getStatus();
    const backups = await backupService.listRecent(5);
    res.json(ok({ ...status, backups }));
  } catch (err) {
    next(err);
  }
});

router.put('/backup-config', async (req, res, next) => {
  try {
    res.json(ok(await backupService.saveBackupConfig(req.body || {})));
  } catch (err) {
    next(err);
  }
});

router.post('/backups/run', async (req, res, next) => {
  try {
    const row = await backupService.runBackup({ triggered_by: 'manual' });
    res.json(ok(row));
  } catch (err) {
    next(err);
  }
});

router.delete('/backups/:id', async (req, res, next) => {
  try {
    res.json(ok(await backupService.deleteBackup(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.post('/backups/:id/restore', async (req, res, next) => {
  try {
    res.json(
      ok(
        await backupService.restoreBackup(req.params.id, {
          confirm: Boolean(req.body?.confirm),
        })
      )
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
