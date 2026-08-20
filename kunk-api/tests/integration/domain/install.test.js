'use strict';

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp } = require('../../helpers/app');
const { query, ensureAdminUser } = require('../../helpers/db');
const { isSharedProductionDb } = require('../../helpers/integrationEnv');

/** 1x1 PNG */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const INSTALL_EMAIL = 'install-api@test.local';
const INSTALL_PASSWORD = 'InstallOk123!';

const ASSOCIATION = {
  associationName: 'Install API Assoc',
  associationFullName: 'ASSOCIACAO INSTALL API TESTE',
  associationEmail: 'contato-install-api@test.local',
  associationPhone: '11999998888',
  associationSite: 'www.install-api.test',
  associationCnpj: '12345678000199',
  associationCity: 'Sao Paulo',
  associationState: 'SP',
};

const ASSOCIATION_KEYS = [
  'VITE_ASSOCIATION_NAME',
  'VITE_ASSOCIATION_FULL_NAME',
  'VITE_ASSOCIATION_EMAIL',
  'VITE_ASSOCIATION_PHONE',
  'VITE_ASSOCIATION_SITE',
  'VITE_ASSOCIATION_CNPJ',
  'VITE_ASSOCIATION_CITY',
  'VITE_ASSOCIATION_STATE',
  'VITE_ASSOCIATION_LOGO',
  'VITE_ASSOCIATION_LOGO_MENU',
];

async function cleanupInstallArtifacts() {
  const logoRows = await query(
    `SELECT value FROM system_configs
     WHERE system = 'registration' AND key IN ('VITE_ASSOCIATION_LOGO', 'VITE_ASSOCIATION_LOGO_MENU')`
  );
  const fileIds = new Set();
  for (const row of logoRows.rows) {
    const m = String(row.value || '').match(/\/files\/([0-9a-f-]{36})\//i);
    if (m) fileIds.add(m[1]);
  }

  await query(`DELETE FROM system_users WHERE lower(email) = lower($1)`, [INSTALL_EMAIL]);
  await query(
    `DELETE FROM system_configs
     WHERE system = 'registration'
       AND key = ANY($1::text[])
       AND (
         value ILIKE '%Install API%'
         OR value ILIKE '%install-api%'
         OR value ILIKE '%ASSOCIACAO INSTALL%'
         OR value = 'www.install-api.test'
         OR value = '12345678000199'
         OR value = '11999998888'
         OR value ILIKE '%/files/%/download'
       )`,
    [ASSOCIATION_KEYS]
  );

  for (const id of fileIds) {
    await query(`DELETE FROM files WHERE id = $1`, [id]);
  }
  await query(`DELETE FROM files WHERE filename LIKE 'install-logo%'`);
}

async function prepareEmptyOperators() {
  await query(`DELETE FROM system_users`);
}

describe('domain/install', () => {
  let app;

  before(async () => {
    app = getApp();
  });

  afterEach(async () => {
    await cleanupInstallArtifacts();
  });

  after(async () => {
    await cleanupInstallArtifacts();
    await ensureAdminUser();
  });

  function validBody(overrides = {}) {
    return {
      name: 'Admin',
      last_name: 'Install',
      email: INSTALL_EMAIL,
      password: INSTALL_PASSWORD,
      password_confirm: INSTALL_PASSWORD,
      logo_base64: TINY_PNG_BASE64,
      logo_mime: 'image/png',
      association: { ...ASSOCIATION },
      ...overrides,
    };
  }

  it('GET install-status reflects empty operators', async () => {
    await prepareEmptyOperators();
    const res = await request(app).get('/api/v1/auth/install-status');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.needs_install, true);
    assert.equal(res.body.data.needs_schema, false);
  });

  it('install creates admin, configs and allows login; second install is 409', async () => {
    await prepareEmptyOperators();

    const created = await request(app).post('/api/v1/auth/install').send(validBody());
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.installed, true);

    const status = await request(app).get('/api/v1/auth/install-status');
    assert.equal(status.body.data.needs_install, false);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send({ email: INSTALL_EMAIL, password: INSTALL_PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(String(login.body.data.user.permissions).includes('Administrador'));

    const nameCfg = await query(
      `SELECT value FROM system_configs WHERE system = 'registration' AND key = 'VITE_ASSOCIATION_NAME'`
    );
    assert.equal(nameCfg.rows[0]?.value, ASSOCIATION.associationName);

    const again = await request(app).post('/api/v1/auth/install').send(validBody({
      email: 'other-install@test.local',
    }));
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.errors[0].code, 'ALREADY_INSTALLED');
  });

  it('rejects weak password', async () => {
    await prepareEmptyOperators();
    const res = await request(app).post('/api/v1/auth/install').send(
      validBody({ password: 'weakpass', password_confirm: 'weakpass' })
    );
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('rejects password_confirm mismatch', async () => {
    await prepareEmptyOperators();
    const res = await request(app).post('/api/v1/auth/install').send(
      validBody({ password_confirm: 'InstallOk123?' })
    );
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('allows missing logo', async () => {
    await prepareEmptyOperators();
    const body = validBody();
    delete body.logo_base64;
    delete body.logo_mime;
    const res = await request(app).post('/api/v1/auth/install').send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.installed, true);
    assert.equal(res.body.data.logo_url, null);
  });

  it('rejects invalid logo mime when logo is sent', async () => {
    await prepareEmptyOperators();
    const res = await request(app).post('/api/v1/auth/install').send(
      validBody({ logo_mime: 'application/pdf' })
    );
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  it('install-sample seeds small demo data after install', { skip: isSharedProductionDb() }, async () => {
    const sampleDataService = require('../../../src/services/sampleDataService');
    await sampleDataService.deleteSampleData();
    await prepareEmptyOperators();

    const statusEmpty = await request(app).get('/api/v1/auth/install-status');
    assert.equal(statusEmpty.body.data.needs_install, true);

    const noInstall = await request(app).post('/api/v1/auth/install-sample');
    assert.equal(noInstall.status, 409, JSON.stringify(noInstall.body));
    assert.equal(noInstall.body.errors[0].code, 'NOT_INSTALLED');

    const created = await request(app).post('/api/v1/auth/install').send(validBody({ demo: true }));
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const seeded = await request(app).post('/api/v1/auth/install-sample');
    assert.equal(seeded.status, 201, JSON.stringify(seeded.body));
    assert.equal(seeded.body.data.installed, true);

    const sampleUsers = await query(`SELECT COUNT(*)::int AS c FROM users WHERE is_sample = true`);
    assert.ok(sampleUsers.rows[0].c >= 1);

    const operators = await query(
      `SELECT COUNT(*)::int AS c FROM system_users WHERE lower(email) = lower($1)`,
      [INSTALL_EMAIL]
    );
    assert.equal(operators.rows[0].c, 1);

    const again = await request(app).post('/api/v1/auth/install-sample');
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.errors[0].code, 'SAMPLE_ALREADY_INSTALLED');

    await sampleDataService.deleteSampleData();
  });
});
