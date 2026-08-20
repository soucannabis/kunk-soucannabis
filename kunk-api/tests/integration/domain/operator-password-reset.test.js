'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');
const { ensureAdminUser, query } = require('../../helpers/db');

describe('domain/auth operator password reset', () => {
  let app;

  before(async () => {
    await ensureAdminUser();
    await query(`
      ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
      ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;
    `);
    const session = await loginAsAdmin();
    app = session.app;
  });

  it('forgot + reset for operator returns generic message and resets password', async () => {
    const email = `op-reset-${Date.now()}@test.local`;
    const hash = await require('../../../src/repositories/authRepository').hashPassword('OldPass123!');
    await query(
      `INSERT INTO system_users (email, password, name, permissions, status, date_created)
       VALUES ($1, $2, 'Reset', $3, 'active', NOW())`,
      [email, hash, JSON.stringify(['Acolhimento'])]
    );

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email, app: 'kunk' });
    assert.equal(forgot.status, 200, JSON.stringify(forgot.body));
    assert.ok(forgot.body.data.reset_token);

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.data.reset_token, password: 'NewPass123!' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send({ email, password: 'NewPass123!' });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    await query(`DELETE FROM system_users WHERE email = $1`, [email]);
  });

  it('forgot for unknown email still returns ok without token', async () => {
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `nobody-${Date.now()}@test.local`, app: 'admin' });
    assert.equal(forgot.status, 200);
    assert.equal(forgot.body.data.reset_token, undefined);
  });
});
