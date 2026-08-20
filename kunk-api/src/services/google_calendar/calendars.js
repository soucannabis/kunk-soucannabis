'use strict';

const client = require('./client');

async function listCalendars() {
  const data = await client.calendarRequest('/users/me/calendarList?maxResults=250');
  const items = data?.items || [];
  return items.map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: Boolean(c.primary),
    accessRole: c.accessRole,
    backgroundColor: c.backgroundColor || null,
  }));
}

module.exports = { listCalendars };
