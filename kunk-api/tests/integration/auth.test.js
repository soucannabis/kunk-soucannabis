'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin, createBearerToken, extractCookie, setApiAccessEnabled } = require('../helpers/auth');
const { getApp } = require('../helpers/app');
const { ensureAdminUser, query } = require('../helpers/db');
const { OPERATOR_COOKIE_BY_APP } = require('../../src/constants/authCookies');
const { sha256Hex } = require('../../src/utils/tokenHash');
const { env } = require('../../src/config/env');
const { resetRateLimits } = require('../../src/utils/rateLimit');

describe('auth', { concurrency: false }, () => {
  let app;
  let cookie;

  async function refreshSession() {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  }

  before(async () => {
    await refreshSession();
  });

  it('login success sets cookie and returns user without secrets', async () => {
    const creds = await ensureAdminUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.user.email);
    assert.equal(res.body.data.user.password, undefined);
    assert.equal(res.body.data.user.session_token, undefined);
    assert.ok(res.headers['set-cookie']);
    cookie = extractCookie(res.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);
    assert.ok(String(cookie).startsWith(`${OPERATOR_COOKIE_BY_APP.admin}=`));
  });

  it('stores hashed session token; cookie still authenticates', async () => {
    const creds = await ensureAdminUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    assert.equal(res.status, 200);
    cookie = extractCookie(res.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);
    const rawToken = String(cookie).slice(`${OPERATOR_COOKIE_BY_APP.admin}=`.length);
    const stored = await query(
      `SELECT session_token FROM operator_sessions
       WHERE user_id = $1 AND app = 'admin' AND is_active = true`,
      [res.body.data.user.id]
    );
    assert.equal(stored.rows[0].session_token, sha256Hex(rawToken));
    assert.notEqual(stored.rows[0].session_token, rawToken);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(me.status, 200);
    assert.ok(me.body.data.user.id);
  });

  it('migrates leftover plaintext session token on use', async () => {
    const creds = await ensureAdminUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    assert.equal(res.status, 200);
    cookie = extractCookie(res.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);
    const rawToken = String(cookie).slice(`${OPERATOR_COOKIE_BY_APP.admin}=`.length);
    await query(
      `UPDATE operator_sessions SET session_token = $1
       WHERE user_id = $2 AND app = 'admin' AND is_active = true`,
      [rawToken, res.body.data.user.id]
    );

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(me.status, 200);

    const stored = await query(
      `SELECT session_token FROM operator_sessions
       WHERE user_id = $1 AND app = 'admin' AND is_active = true`,
      [res.body.data.user.id]
    );
    assert.equal(stored.rows[0].session_token, sha256Hex(rawToken));
  });

  it('login requires app', async () => {
    const creds = await ensureAdminUser();
    const res = await request(app).post('/api/v1/auth/login').send(creds);
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].code, 'VALIDATION_ERROR');
  });

  it('login validation error', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('X-Kunk-App', 'admin').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].code, 'VALIDATION_ERROR');
  });

  it('login invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send({ email: 'admin@kunk-api.test', password: 'wrong' });
    assert.equal(res.status, 401);
    assert.equal(res.body.errors[0].code, 'INVALID_CREDENTIALS');
  });

  it('me with cookie', async () => {
    await refreshSession();
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.user.id);
  });

  it('me unauthorized without auth', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.equal(res.status, 401);
  });

  it('tokens blocked when API disabled', async () => {
    await refreshSession();
    await setApiAccessEnabled(false);

    const created = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({ email: 'tok', scopes: ['*'] });
    assert.equal(created.status, 403);
    assert.equal(created.body.errors[0].code, 'API_DISABLED');

    const list = await request(app)
      .get('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(list.status, 403);
    assert.equal(list.body.errors[0].code, 'API_DISABLED');
  });

  it('tokens CRUD when API enabled', async () => {
    await refreshSession();
    await setApiAccessEnabled(true);

    const created = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({ email: 'tok', scopes: ['*'] });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.token.startsWith('kunk_live_'));
    assert.ok(created.body.data.label || created.body.data.email);

    const list = await request(app)
      .get('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data));
    assert.ok(!JSON.stringify(list.body.data).includes(created.body.data.token));

    const patched = await request(app)
      .patch(`/api/v1/auth/tokens/${created.body.data.id}`)
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({ label: 'tok-updated', scopes: ['items:orders:read'] });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.label, 'tok-updated');
    assert.deepEqual(patched.body.data.scopes, ['items:orders:read']);

    const del = await request(app)
      .delete(`/api/v1/auth/tokens/${created.body.data.id}`)
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(del.status, 200);
  });

  it('rejects invalid token scopes', async () => {
    await refreshSession();
    await setApiAccessEnabled(true);
    const res = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({ label: 'bad', scopes: ['items:users_api:read'] });
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].code, 'VALIDATION_ERROR');
  });

  it('creates token with full expanded scopes list', async () => {
    await refreshSession();
    await setApiAccessEnabled(true);
    const { API_TOKEN_COLLECTIONS } = require('../../src/schema/rbac');
    const scopes = API_TOKEN_COLLECTIONS.flatMap((c) => [
      `items:${c}:read`,
      `items:${c}:write`,
      `items:${c}:delete`,
    ]);
    assert.ok(scopes.length > 20, 'expected a large scopes list');

    const created = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .send({ label: 'full-matrix', scopes });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.ok(created.body.data.token.startsWith('kunk_live_'));
    assert.equal(created.body.data.label, 'full-matrix');
    assert.deepEqual(created.body.data.scopes, scopes);

    const list = await request(app)
      .get('/api/v1/auth/tokens')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(list.status, 200);
    const row = list.body.data.find((t) => t.id === created.body.data.id);
    assert.ok(row);
    assert.equal(row.label, 'full-matrix');
    assert.deepEqual(row.scopes, scopes);

    await request(app)
      .delete(`/api/v1/auth/tokens/${created.body.data.id}`)
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin');
  });

  it('bearer auth works when API enabled', async () => {
    await refreshSession();
    const token = await createBearerToken(cookie);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
  });

  it('bearer auth rejected when API disabled', async () => {
    await refreshSession();
    const token = await createBearerToken(cookie);
    await setApiAccessEnabled(false);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.errors[0].code, 'API_DISABLED');
    await setApiAccessEnabled(true);
  });

  it('scoped bearer respects hasScope on items', async () => {
    await refreshSession();
    const token = await createBearerToken(cookie, ['items:products:read']);
    const okRead = await request(app)
      .get('/api/v1/items/products')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(okRead.status, 200);

    const denied = await request(app)
      .get('/api/v1/items/orders')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(denied.status, 403);
  });

  it('limited bearer cannot manage tokens or operators', async () => {
    await refreshSession();
    await setApiAccessEnabled(true);
    const limited = await createBearerToken(cookie, ['items:orders:read']);

    const createToken = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Authorization', `Bearer ${limited}`)
      .send({ email: 'escalated', scopes: ['*'] });
    assert.equal(createToken.status, 403);
    assert.equal(createToken.body.errors[0].code, 'FORBIDDEN');

    const invite = await request(app)
      .post('/api/v1/system-users')
      .set('Authorization', `Bearer ${limited}`)
      .send({
        email: `esc${Date.now()}@t.com`,
        name: 'Esc',
        last_name: 'Alated',
        permissions: ['Administrador'],
      });
    assert.equal(invite.status, 403);
    assert.equal(invite.body.errors[0].code, 'FORBIDDEN');
  });

  it('bearer looks up by token_prefix; wrong suffix and plaintext leftover fail', async () => {
    await refreshSession();
    await setApiAccessEnabled(true);
    const token = await createBearerToken(cookie);

    const okMe = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(okMe.status, 200);

    const wrongSuffix = `${token.slice(0, -4)}ffff`;
    const miss = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${wrongSuffix}`);
    assert.equal(miss.status, 401);

    const { query } = require('../helpers/db');
    const { apiTokenLookupPrefix } = require('../../src/utils/apiToken');
    const { ensureUsersApiTokenPrefix } = require('../../src/db/ensureUsersApiTokenPrefix');
    await ensureUsersApiTokenPrefix();
    const plain = `kunk_live_plain${'a'.repeat(40)}`;
    const prefix = apiTokenLookupPrefix(plain);
    const inserted = await query(
      `INSERT INTO users_api (email, token, token_prefix, scopes) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
      [JSON.stringify({ label: 'plain-leftover', scopes: ['*'] }), plain, prefix, JSON.stringify(['*'])]
    );
    try {
      const rejected = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${plain}`);
      assert.equal(rejected.status, 401);
    } finally {
      await query(`DELETE FROM users_api WHERE id = $1`, [inserted.rows[0].id]);
    }
  });

  it('star bearer can list and create tokens when API enabled', async () => {
    await refreshSession();
    const star = await createBearerToken(cookie, ['*']);

    const list = await request(app)
      .get('/api/v1/auth/tokens')
      .set('Authorization', `Bearer ${star}`);
    assert.equal(list.status, 200);

    const created = await request(app)
      .post('/api/v1/auth/tokens')
      .set('Authorization', `Bearer ${star}`)
      .send({ email: 'star-child', scopes: ['items:orders:read'] });
    assert.equal(created.status, 201);
  });

  it('cookie + bearer conflict', async () => {
    await refreshSession();
    const token = await createBearerToken(cookie);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .set('X-Kunk-App', 'admin')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.errors[0].code, 'AUTH_CONFLICT');
  });

  it('logout', async () => {
    const session = await loginAsAdmin();
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', session.cookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ok, true);
  });

  it('sessions coexist across apps for the same user', async () => {
    const creds = await ensureAdminUser();
    app = getApp();

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    assert.equal(adminLogin.status, 200);
    const adminCookie = extractCookie(adminLogin.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);

    const kunkLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'kunk')
      .send(creds);
    assert.equal(kunkLogin.status, 200);
    const kunkCookie = extractCookie(kunkLogin.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.kunk);

    const adminMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(adminMe.status, 200, JSON.stringify(adminMe.body));

    const kunkMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', kunkCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(kunkMe.status, 200);
  });

  it('logout of one app keeps the other session', async () => {
    const creds = await ensureAdminUser();
    app = getApp();

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    const adminCookie = extractCookie(adminLogin.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);

    const kunkLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'kunk')
      .send(creds);
    const kunkCookie = extractCookie(kunkLogin.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.kunk);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(logout.status, 200);

    const adminMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(adminMe.status, 401);

    const kunkMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', kunkCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(kunkMe.status, 200);
  });

  it('relogin on same app invalidates previous session of that app only', async () => {
    const creds = await ensureAdminUser();
    app = getApp();

    const first = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    const firstCookie = extractCookie(first.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);

    const kunkLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'kunk')
      .send(creds);
    const kunkCookie = extractCookie(kunkLogin.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.kunk);

    const second = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Kunk-App', 'admin')
      .send(creds);
    const secondCookie = extractCookie(second.headers['set-cookie'], OPERATOR_COOKIE_BY_APP.admin);

    const oldMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', firstCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(oldMe.status, 401);

    const newMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', secondCookie)
      .set('X-Kunk-App', 'admin');
    assert.equal(newMe.status, 200);

    const kunkMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', kunkCookie)
      .set('X-Kunk-App', 'kunk');
    assert.equal(kunkMe.status, 200);
  });

  it('rejects leftover plaintext operator password; forgot+reset recovers', async () => {
    const crypto = require('crypto');
    const { query } = require('../helpers/db');
    const { getApp } = require('../helpers/app');
    const { isBcryptHash, verifyPassword } = require('../../src/utils/password');
    const localApp = getApp();
    const email = `plain-op-${crypto.randomUUID()}@test.local`;
    const leftover = 'Leftover123!';
    await query(`DELETE FROM operator_sessions WHERE user_id IN (SELECT id FROM system_users WHERE email = $1)`, [
      email,
    ]).catch(() => {});
    await query(`DELETE FROM system_users WHERE email = $1`, [email]);
    const inserted = await query(
      `INSERT INTO system_users (email, password, name, permissions, status, date_created)
       VALUES ($1, $2, 'Plain', $3, 'active', NOW())
       RETURNING id`,
      [email, leftover, JSON.stringify(['Acolhimento'])]
    );
    const userId = inserted.rows[0].id;

    try {
      const denied = await request(localApp)
        .post('/api/v1/auth/login')
        .set('X-Kunk-App', 'admin')
        .send({ email, password: leftover });
      assert.equal(denied.status, 401);
      assert.equal(denied.body.errors[0].code, 'INVALID_CREDENTIALS');

      const forgot = await request(localApp)
        .post('/api/v1/auth/forgot-password')
        .send({ email, app: 'admin' });
      assert.equal(forgot.status, 200, JSON.stringify(forgot.body));
      assert.ok(forgot.body.data.reset_token);

      const reset = await request(localApp)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgot.body.data.reset_token, password: 'NewPass123!' });
      assert.equal(reset.status, 200, JSON.stringify(reset.body));

      const stored = await query(`SELECT password FROM system_users WHERE id = $1`, [userId]);
      assert.equal(isBcryptHash(stored.rows[0].password), true);
      assert.equal(await verifyPassword('NewPass123!', stored.rows[0].password), true);

      const login = await request(localApp)
        .post('/api/v1/auth/login')
        .set('X-Kunk-App', 'admin')
        .send({ email, password: 'NewPass123!' });
      assert.equal(login.status, 200, JSON.stringify(login.body));
    } finally {
      await query(`DELETE FROM operator_sessions WHERE user_id = $1`, [userId]).catch(() => {});
      await query(`DELETE FROM system_users WHERE id = $1`, [userId]);
    }
  });

  it('rate-limits operator login after 5 failures per IP+email; successes do not count', async () => {
    const prev = env.authEnumRateLimit;
    env.authEnumRateLimit = true;
    resetRateLimits();
    const crypto = require('crypto');
    const { query } = require('../helpers/db');
    const { hashPassword } = require('../../src/utils/password');
    const email = `login-rl-${crypto.randomUUID()}@test.local`;
    const password = 'TestAdmin123!';
    let userId;
    try {
      const hash = await hashPassword(password);
      const inserted = await query(
        `INSERT INTO system_users (email, password, name, permissions, status, date_created)
         VALUES ($1, $2, 'Rl', $3, 'active', NOW()) RETURNING id`,
        [email, hash, JSON.stringify(['Acolhimento'])]
      );
      userId = inserted.rows[0].id;
      const creds = { email, password };
      for (let i = 0; i < 3; i++) {
        const okLogin = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Kunk-App', 'admin')
          .send(creds);
        assert.equal(okLogin.status, 200, JSON.stringify(okLogin.body));
      }
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Kunk-App', 'admin')
          .send({ email, password: 'wrong-password' });
        assert.equal(res.status, 401, JSON.stringify(res.body));
        assert.equal(res.body.errors[0].code, 'INVALID_CREDENTIALS');
      }
      const limited = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Kunk-App', 'admin')
        .send({ email, password: 'wrong-password' });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
    } finally {
      if (userId) {
        await query(`DELETE FROM operator_sessions WHERE user_id = $1`, [userId]).catch(() => {});
        await query(`DELETE FROM system_users WHERE id = $1`, [userId]).catch(() => {});
      }
      env.authEnumRateLimit = prev;
      resetRateLimits();
    }
  });

  it('forgot-password rate limit ignores spoofed X-Forwarded-For', async () => {
    resetRateLimits();
    const email = `forgot-xff-${Date.now()}@test.local`;
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', `1.2.3.${i}`)
        .send({ email, app: 'admin' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    const limited = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', '9.9.9.9')
      .send({ email, app: 'admin' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.errors[0].code, 'RATE_LIMITED');
    resetRateLimits();
  });
});
