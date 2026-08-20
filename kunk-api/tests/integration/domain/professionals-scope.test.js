'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { loginAsAdmin, loginAsOperator } = require('../../helpers/auth');

describe('domain/professionals-scope', () => {
  let app;
  let adminCookie;
  let portalCookie;
  let own;
  let other;

  before(async () => {
    const admin = await loginAsAdmin();
    app = admin.app;
    adminCookie = admin.cookie;
    assert.ok(adminCookie, 'admin cookie ausente');
    assert.match(adminCookie, /^kunk_oss_session_admin=/);

    const stamp = Date.now();
    const ownCode = uuidv4();
    const otherCode = uuidv4();

    const createdOwn = await request(app)
      .post('/api/v1/items/professionals')
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin')
      .send({
        name: 'Portal',
        last_name: 'Own',
        email: `portal-own-${stamp}@test.local`,
        professional_code: ownCode,
        donation_balance: 0,
        is_collaborator: 'true',
      });
    assert.equal(createdOwn.status, 201, JSON.stringify(createdOwn.body));
    own = createdOwn.body.data;

    const createdOther = await request(app)
      .post('/api/v1/items/professionals')
      .set('Cookie', adminCookie)
      .set('X-Kunk-App', 'admin')
      .send({
        name: 'Portal',
        last_name: 'Other',
        email: `portal-other-${stamp}@test.local`,
        professional_code: otherCode,
        donation_balance: 0,
        is_collaborator: 'true',
      });
    assert.equal(createdOther.status, 201, JSON.stringify(createdOther.body));
    other = createdOther.body.data;

    const portal = await loginAsOperator({
      email: `profissional-${stamp}@kunk-api.test`,
      password: 'TestPro123!',
      permissions: ['Profissional'],
      name: 'Portal',
      last_name: 'User',
      internal_code: ownCode,
      app: 'kunk',
    });
    portalCookie = portal.cookie;
  });

  function asPortal(method, path) {
    return request(app)[method](path).set('Cookie', portalCookie).set('X-Kunk-App', 'kunk');
  }

  it('GET lista só o próprio cadastro', async () => {
    const list = await asPortal('get', '/api/v1/professionals');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const rows = list.body.data;
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, own.id);
  });

  it('GET/PATCH de outro profissional retorna 404', async () => {
    const getOther = await asPortal('get', `/api/v1/professionals/${other.id}`);
    assert.equal(getOther.status, 404);

    const patchOther = await asPortal('patch', `/api/v1/professionals/${other.id}`).send({
      name: 'Hacked',
    });
    assert.equal(patchOther.status, 404);
  });

  it('PATCH donation_balance no próprio cadastro e rota dedicada retornam 403', async () => {
    const patchOwn = await asPortal('patch', `/api/v1/professionals/${own.id}`).send({
      donation_balance: 999,
    });
    assert.equal(patchOwn.status, 403);

    const dedicated = await asPortal(
      'patch',
      `/api/v1/professionals/${own.id}/donation-balance`
    ).send({ donation_balance: 999 });
    assert.equal(dedicated.status, 403);
  });

  it('POST portal-access é 403 no próprio e no de outro', async () => {
    const ownInvite = await asPortal('post', `/api/v1/professionals/${own.id}/portal-access`).send(
      {}
    );
    assert.equal(ownInvite.status, 403);

    const otherInvite = await asPortal(
      'post',
      `/api/v1/professionals/${other.id}/portal-access`
    ).send({});
    assert.equal(otherInvite.status, 403);
  });

  it('POST contest-reports só no próprio registro', async () => {
    const ownContest = await asPortal(
      'post',
      `/api/v1/professionals/${own.id}/contest-reports`
    ).send({ text: 'Divergência de taxa', month: 'março 2026' });
    assert.equal(ownContest.status, 201, JSON.stringify(ownContest.body));

    const otherContest = await asPortal(
      'post',
      `/api/v1/professionals/${other.id}/contest-reports`
    ).send({ text: 'Não deveria', month: 'março 2026' });
    assert.equal(otherContest.status, 403);
  });

  it('GET /items/professionals lista só o próprio cadastro', async () => {
    const list = await asPortal('get', '/api/v1/items/professionals');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const rows = list.body.data;
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].professional_code), String(own.professional_code));
  });
});
