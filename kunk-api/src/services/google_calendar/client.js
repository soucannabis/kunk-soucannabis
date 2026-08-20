'use strict';

const { AppError } = require('../../utils/response');
const auth = require('./auth');

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function parseGoogleErrorBody(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function googleReason(parsed) {
  return parsed?.error?.errors?.[0]?.reason || parsed?.error?.status || null;
}

function googleMessage(parsed) {
  const msg = parsed?.error?.message || parsed?.error?.errors?.[0]?.message;
  return msg ? String(msg) : null;
}

/**
 * Converte falhas da Calendar API em AppError legível (sem dump JSON cru).
 */
function mapGoogleCalendarError(status, text, path = '') {
  const parsed = parseGoogleErrorBody(text);
  const reason = googleReason(parsed);
  const gMsg = googleMessage(parsed);
  const pathLower = String(path || '').toLowerCase();
  const isEventResourcePath = /\/events\/[^/]+/.test(pathLower);
  const details = {
    google_status: status,
    ...(reason ? { google_reason: reason } : {}),
    ...(path ? { path } : {}),
  };

  if (status === 401 || reason === 'authError' || reason === 'unauthorized') {
    return new AppError(
      401,
      'OAUTH_REQUIRED',
      'Sessão do Google Calendar expirada ou inválida. Autorize novamente em Admin → Serviços externos → Google Calendar.',
      details
    );
  }

  const msgLower = String(gMsg || '').toLowerCase();
  const resourceGone =
    status === 410 ||
    reason === 'deleted' ||
    msgLower.includes('resource has been deleted') ||
    msgLower.includes('has been deleted');

  // Evento já excluído / inexistente no Google
  if (
    resourceGone ||
    ((status === 404 || reason === 'notFound') && isEventResourcePath)
  ) {
    return new AppError(
      404,
      'EVENT_NOT_FOUND',
      'Evento não encontrado no Google Calendar (pode ter sido removido na agenda).',
      details
    );
  }

  if (status === 404 || reason === 'notFound') {
    return new AppError(
      404,
      'CALENDAR_NOT_FOUND',
      'Agenda do Google não encontrada para este profissional. Verifique o calendário cadastrado em Profissionais — o ID pode estar incorreto ou a conta OAuth sem acesso a essa agenda.',
      details
    );
  }

  if (status === 403 || reason === 'forbidden' || reason === 'insufficientPermissions') {
    return new AppError(
      403,
      'CALENDAR_FORBIDDEN',
      'A conta Google autorizada não tem permissão nesta agenda. Confira o compartilhamento do calendário do profissional.',
      details
    );
  }

  if (status === 409 || reason === 'conflict') {
    return new AppError(
      409,
      'GOOGLE_CONFLICT',
      'Conflito ao atualizar o evento no Google Calendar. Tente novamente.',
      details
    );
  }

  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return new AppError(
      429,
      'RATE_LIMITED',
      'Limite de requisições do Google Calendar atingido. Aguarde um momento e tente de novo.',
      details
    );
  }

  if (status === 400 || reason === 'badRequest' || reason === 'invalid') {
    return new AppError(
      400,
      'GOOGLE_VALIDATION_ERROR',
      gMsg && gMsg !== 'Bad Request'
        ? `Dados inválidos para o Google Calendar: ${gMsg}`
        : 'Dados inválidos para criar ou atualizar o evento no Google Calendar (data, fuso ou agenda).',
      details
    );
  }

  if (status >= 500) {
    return new AppError(
      502,
      'GOOGLE_API_ERROR',
      'Google Calendar temporariamente indisponível. Tente novamente em instantes.',
      details
    );
  }

  return new AppError(
    502,
    'GOOGLE_API_ERROR',
    gMsg && gMsg.length < 160
      ? `Falha no Google Calendar: ${gMsg}`
      : 'Falha ao comunicar com o Google Calendar. Tente novamente ou confira a configuração da agenda.',
    details
  );
}

async function calendarRequest(path, { method = 'GET', body = null } = {}) {
  let token = await auth.getAccessToken();
  const doFetch = async (t) =>
    fetch(`${CALENDAR_API}${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    try {
      token = await auth.refreshAccessToken();
      res = await doFetch(token);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        401,
        'OAUTH_REQUIRED',
        'Não foi possível renovar o acesso ao Google Calendar. Autorize novamente no Admin.',
        { cause: err.message }
      );
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw mapGoogleCalendarError(res.status, text, path);
  }
  if (res.status === 204) return null;
  return res.json();
}

module.exports = {
  calendarRequest,
  CALENDAR_API,
  mapGoogleCalendarError,
};
