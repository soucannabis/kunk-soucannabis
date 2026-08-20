'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loginAsAdmin } = require('../../helpers/auth');

describe('domain/analytics', () => {
  let app;
  let cookie;

  before(async () => {
    const session = await loginAsAdmin();
    app = session.app;
    cookie = session.cookie;
  });

  function assertShape(body) {
    assert.ok(body.data);
    assert.ok(body.data.period);
    assert.ok(body.data.kpis);
    assert.ok(body.data.series);
    assert.ok(body.data.rankings);
    assert.ok(body.data.period.start);
    assert.ok(body.data.period.end);
    assert.ok(body.data.period.group_by);
  }

  it('GET /analytics/associates', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/associates')
      .query({ start: '2020-01-01', end: '2030-12-31', group_by: 'month' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assertShape(res.body);
    assert.ok(typeof res.body.data.kpis.total === 'number');
    assert.ok(res.body.data.kpis.total > 0, 'default associates filter should return non-patient users');
    assert.ok(Array.isArray(res.body.data.series.by_date));
    assert.ok(Array.isArray(res.body.data.series.by_state));
    assert.ok(Array.isArray(res.body.data.series.by_age));
    assert.ok(Array.isArray(res.body.data.series.by_gender));
  });

  it('GET /analytics/services', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/services')
      .query({ start: '2020-01-01', end: '2030-12-31', group_by: 'month' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assertShape(res.body);
    assert.ok(typeof res.body.data.kpis.payable_sum === 'number');
    assert.ok(typeof res.body.data.kpis.association_fee_sum === 'number');
    assert.ok(Array.isArray(res.body.data.series.by_type));
    assert.ok(Array.isArray(res.body.data.rankings.top_associates));
  });

  it('GET /analytics/orders', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/orders')
      .query({ start: '2020-01-01', end: '2030-12-31', group_by: 'day' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assertShape(res.body);
    assert.ok(typeof res.body.data.kpis.freight_avg === 'number');
    assert.ok(Array.isArray(res.body.data.series.by_state));
    assert.ok(Array.isArray(res.body.data.rankings.top_products));
  });

  it('GET /analytics/reception', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/reception')
      .query({ start: '2020-01-01', end: '2030-12-31', group_by: 'month' })
      .set('Cookie', cookie);
    assert.equal(res.status, 200);
    assertShape(res.body);
    assert.ok(typeof res.body.data.kpis.to_orders === 'number');
    assert.ok(typeof res.body.data.kpis.to_services === 'number');
    assert.ok(Array.isArray(res.body.data.series.by_attendant));
  });

  it('rejects invalid period', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/associates')
      .query({ start: 'bad', end: '2026-01-01' })
      .set('Cookie', cookie);
    assert.equal(res.status, 400);
  });
});
