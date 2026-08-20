'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildEventBody } = require('../../src/services/google_calendar/events');

describe('google_calendar buildEventBody', () => {
  it('defaults end to start+1h', () => {
    const body = buildEventBody({
      summary: 'Teste',
      start: '2026-07-20T14:00:00.000Z',
    });
    assert.equal(body.summary, 'Teste');
    assert.ok(body.start.dateTime);
    assert.ok(body.end.dateTime);
    const start = new Date(body.start.dateTime).getTime();
    const end = new Date(body.end.dateTime).getTime();
    assert.equal(end - start, 60 * 60 * 1000);
  });
});
