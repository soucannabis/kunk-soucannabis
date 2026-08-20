'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok } = require('../../utils/response');
const auth = require('../../services/google_calendar/auth');
const { createOAuthState } = require('../../services/oauthState');
const calendars = require('../../services/google_calendar/calendars');
const events = require('../../services/google_calendar/events');
const credentialsService = require('../../services/credentialsService');

const router = Router();

/**
 * Setup / OAuth / teste / listagem de calendários ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/oauth/authorize', authorizeAdmin, async (req, res, next) => {
  try {
    const { oauthRedirectUri } = require('../../utils/publicApiUrl');
    await auth.ensureCredentialRows();
    await credentialsService.putCredentials(
      'google_calendar',
      { redirect_uri: oauthRedirectUri('google_calendar') },
      { runTest: false }
    );
    const url = await auth.getAuthorizeUrl(createOAuthState('google_calendar'));
    if (req.query.redirect === '0') {
      return res.json(ok({ url }));
    }
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

router.get('/oauth/status', authorizeAdmin, async (req, res, next) => {
  try {
    const data = await auth.oauthStatus();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const { isModuleEnabled } = require('../../services/moduleFlags');
    const oauth = await auth.oauthStatus();
    const primary = await auth.getPrimaryCalendarId();
    const useScheduling = await auth.getSchedulingEnabled();
    res.json(
      ok({
        module: 'google_calendar',
        enabled: await isModuleEnabled('google_calendar'),
        use_for_scheduling: useScheduling,
        primary_calendar_id: primary,
        credentials_complete: oauth.credentials_complete,
        oauth_connected: oauth.connected,
        ...oauth,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/calendars', async (req, res, next) => {
  try {
    const data = await calendars.listCalendars();
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const creds = await credentialsService.resolveAll('google_calendar');
    await auth.testConnection(creds);
    await credentialsService.markTestResult('google_calendar', true);
    res.json(ok({ ok: true }));
  } catch (err) {
    await credentialsService.markTestResult('google_calendar', false).catch(() => {});
    next(err);
  }
});

// Eventos / uso no sistema exigem módulo ativo no Admin.
router.use(requireModule('google_calendar'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'google_calendar', status: 'enabled' }));
});

router.post('/events', async (req, res, next) => {
  try {
    const data = await events.createEvent(req.body || {});
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.patch('/events/:eventId', async (req, res, next) => {
  try {
    const data = await events.updateEvent(req.params.eventId, {
      ...(req.body || {}),
      calendarId: req.body?.calendarId || req.query.calendarId,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.delete('/events/:eventId', async (req, res, next) => {
  try {
    const calendarId = req.query.calendarId || req.body?.calendarId;
    const data = await events.deleteEvent(req.params.eventId, calendarId);
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
