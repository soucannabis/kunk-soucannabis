'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapGoogleCalendarError } = require('../../src/services/google_calendar/client');

describe('mapGoogleCalendarError', () => {
  const notFoundBody = JSON.stringify({
    error: {
      errors: [{ domain: 'global', reason: 'notFound', message: 'Not Found' }],
      code: 404,
      message: 'Not Found',
    },
  });

  it('maps calendar 404 to CALENDAR_NOT_FOUND with friendly PT message', () => {
    const err = mapGoogleCalendarError(
      404,
      notFoundBody,
      '/calendars/abc%40group.calendar.google.com/events'
    );
    assert.equal(err.code, 'CALENDAR_NOT_FOUND');
    assert.equal(err.status, 404);
    assert.match(err.message, /Agenda do Google não encontrada/i);
    assert.equal(err.message.includes('{'), false);
    assert.equal(err.details?.google_reason, 'notFound');
    assert.equal(err.details?.body, undefined);
  });

  it('maps event 404 to EVENT_NOT_FOUND', () => {
    const err = mapGoogleCalendarError(404, notFoundBody, '/calendars/abc/events/evt123');
    assert.equal(err.code, 'EVENT_NOT_FOUND');
    assert.match(err.message, /Evento não encontrado/i);
  });

  it('maps 403 to CALENDAR_FORBIDDEN', () => {
    const err = mapGoogleCalendarError(
      403,
      JSON.stringify({
        error: { errors: [{ reason: 'forbidden' }], message: 'Forbidden' },
      }),
      '/calendars/x/events'
    );
    assert.equal(err.code, 'CALENDAR_FORBIDDEN');
    assert.equal(err.status, 403);
  });

  it('maps 401 to OAUTH_REQUIRED', () => {
    const err = mapGoogleCalendarError(401, '{}', '/calendars/x/events');
    assert.equal(err.code, 'OAUTH_REQUIRED');
    assert.equal(err.status, 401);
  });

  it('maps 410 Resource has been deleted to EVENT_NOT_FOUND', () => {
    const err = mapGoogleCalendarError(
      410,
      JSON.stringify({
        error: {
          errors: [{ reason: 'deleted', message: 'Resource has been deleted' }],
          code: 410,
          message: 'Resource has been deleted',
        },
      }),
      '/calendars/abc/events/evt123'
    );
    assert.equal(err.code, 'EVENT_NOT_FOUND');
    assert.equal(err.status, 404);
  });

  it('maps Resource has been deleted (any status) to EVENT_NOT_FOUND', () => {
    const err = mapGoogleCalendarError(
      403,
      JSON.stringify({
        error: { message: 'Resource has been deleted' },
      }),
      '/calendars/abc/events/evt123'
    );
    assert.equal(err.code, 'EVENT_NOT_FOUND');
  });
});
