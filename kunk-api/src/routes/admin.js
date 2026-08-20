'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { ok } = require('../utils/response');
const {
  TARGET_TABLES,
  COLUMNS,
  PK,
  SENSITIVE_FIELDS,
  READONLY_FIELDS,
  READONLY_ON_UPDATE,
  SEARCHABLE,
} = require('../schema/collections');
const { MATRIX } = require('../schema/rbac');
const externalServices = require('./externalServices');
const storageAdmin = require('./storageAdmin');
const sampleDataAdmin = require('./sampleDataAdmin');
const systemErrorsAdmin = require('./systemErrorsAdmin');
const webVitalsAdmin = require('./webVitalsAdmin');
const cacheAdmin = require('./cacheAdmin');
const supportCredentialsAdmin = require('./supportCredentialsAdmin');
const systemHealthAdmin = require('./systemHealthAdmin');
const webhooksAdmin = require('./webhooksAdmin');

const router = Router();
router.use(authenticate, requireRole('Administrador'));

router.use('/external-services', externalServices);
router.use('/storage', storageAdmin);
router.use('/sample-data', sampleDataAdmin);
router.use('/system-errors', systemErrorsAdmin);
router.use('/web-vitals', webVitalsAdmin);
router.use('/cache', cacheAdmin);
router.use('/support-credentials', supportCredentialsAdmin);
router.use('/system-health', systemHealthAdmin);
router.use('/webhooks', webhooksAdmin);

const ROLE_DESCRIPTIONS = {
  Administrador: 'Acesso total + app admin',
  Acolhimento: 'Painel operacional (acolhimento)',
  Produção: 'Painel operacional (produção)',
  Financeiro: 'Painel operacional (financeiro)',
  Profissional: 'Portal do relatório de atendimentos (próprios dados)',
  api: 'Reservado a tokens de integração',
};

/** Known FK hints for admin UI navigation */
const RELATIONS = {
  orders: [{ field: 'user', collection: 'users', target: 'id' }],
  orders_files: [
    { field: 'order_id', collection: 'orders', target: 'id' },
    { field: 'file_id', collection: 'files', target: 'id' },
  ],
  services: [
    { field: 'associate_user_code', collection: 'users', target: 'user_code' },
    { field: 'professional_id', collection: 'professionals', target: 'professional_code' },
  ],
  services_files: [
    { field: 'service_id', collection: 'services', target: 'id' },
    { field: 'file_id', collection: 'files', target: 'id' },
  ],
  users_files: [
    { field: 'user_id', collection: 'users', target: 'id' },
    { field: 'file_id', collection: 'files', target: 'id' },
  ],
  users: [{ field: 'responsible_code', collection: 'users', target: 'user_code' }],
};

router.get('/schema', (req, res) => {
  const collections = TARGET_TABLES.map((name) => ({
    name,
    pk: PK[name],
    columns: COLUMNS[name] || [],
    sensitive: SENSITIVE_FIELDS[name] || [],
    readonly: READONLY_FIELDS[name] || [],
    readonlyOnUpdate: READONLY_ON_UPDATE[name] || [],
    searchable: SEARCHABLE[name] || [],
    relations: RELATIONS[name] || [],
  }));
  res.json(ok({ collections }));
});

router.get('/roles', (req, res) => {
  const roleIds = new Set([...Object.keys(MATRIX), ...Object.keys(ROLE_DESCRIPTIONS)]);
  const data = [...roleIds].sort().map((id) => ({
    id,
    description: ROLE_DESCRIPTIONS[id] || id,
  }));
  res.json(ok(data));
});

module.exports = router;
