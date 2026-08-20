'use strict';

const { AppError } = require('../../utils/response');
const client = require('./client');
const auth = require('./auth');
const itemsRepository = require('../../repositories/itemsRepository');

function assertScheduling() {
  return auth.getSchedulingEnabled().then((on) => {
    if (!on) {
      throw new AppError(403, 'SCHEDULING_DISABLED', 'Agendamento Google Calendar desabilitado');
    }
  });
}

function encodeCalendarId(calendarId) {
  return encodeURIComponent(calendarId);
}

function buildEventBody({ summary, description, start, end, timeZone }) {
  const tz = timeZone || 'America/Sao_Paulo';
  let endIso = end;
  if (!endIso && start) {
    const d = new Date(start);
    d.setHours(d.getHours() + 1);
    endIso = d.toISOString();
  }
  return {
    summary: summary || 'Consulta',
    description: description || '',
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: endIso, timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };
}

async function createEvent(payload = {}) {
  await assertScheduling();
  const calendarId = payload.calendarId || payload.calendar_id;
  if (!calendarId) {
    throw new AppError(
      400,
      'CALENDAR_NOT_CONFIGURED',
      'Informe a agenda do Google (calendarId) para criar o evento.'
    );
  }
  if (!String(calendarId).trim()) {
    throw new AppError(
      400,
      'CALENDAR_NOT_CONFIGURED',
      'Agenda do Google inválida (vazia). Cadastre o calendário do profissional.'
    );
  }
  if (!payload.start) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Data/hora de início do evento é obrigatória');
  }
  const body = buildEventBody(payload);
  const data = await client.calendarRequest(`/calendars/${encodeCalendarId(calendarId)}/events`, {
    method: 'POST',
    body,
  });
  const result = {
    event_id: data.id,
    event_link: data.htmlLink || null,
    calendar_id: calendarId,
  };
  if (payload.service_id) {
    await itemsRepository.updateItem('services', payload.service_id, {
      event_id: result.event_id,
      event_link: result.event_link,
    });
  }
  return result;
}

async function updateEvent(eventId, payload = {}) {
  await assertScheduling();
  const calendarId = payload.calendarId || payload.calendar_id;
  if (!calendarId || !eventId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'calendarId e eventId obrigatórios');
  }
  const patch = {};
  if (payload.summary != null) patch.summary = payload.summary;
  if (payload.description != null) patch.description = payload.description;
  if (payload.start) {
    const tz = payload.timeZone || 'America/Sao_Paulo';
    let endIso = payload.end;
    if (!endIso) {
      const d = new Date(payload.start);
      d.setHours(d.getHours() + 1);
      endIso = d.toISOString();
    }
    patch.start = { dateTime: payload.start, timeZone: tz };
    patch.end = { dateTime: endIso, timeZone: tz };
  }
  const data = await client.calendarRequest(
    `/calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: patch }
  );
  return {
    event_id: data.id,
    event_link: data.htmlLink || null,
    calendar_id: calendarId,
  };
}

async function deleteEvent(eventId, calendarId) {
  await assertScheduling();
  if (!calendarId || !eventId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'calendarId e eventId obrigatórios');
  }
  await client.calendarRequest(
    `/calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
  return { ok: true };
}

module.exports = { createEvent, updateEvent, deleteEvent, buildEventBody };
