'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok, AppError } = require('../../utils/response');
const { requireModule } = require('./requireModule');
const { assertOAuthState } = require('../../services/oauthState');

const MODULE_NAMES = [
  'pagarme',
  'soucannabis_orders',
  'loggi',
  'melhorenvio',
  'google_calendar',
  'utalk',
  'geoapify',
  'ciap2',
  'email',
];

const router = Router();
const meAuth = require('../../services/melhorenvio/auth');

function adminPublicBase() {
  return (process.env.ADMIN_PUBLIC_URL || 'http://localhost:4256').replace(/\/$/, '');
}

function oauthResultHtml({ ok: success, message, type, servicePath, title }) {
  const admin = adminPublicBase();
  const payload = JSON.stringify({
    type,
    ok: Boolean(success),
    message: message || null,
  });
  const redirect = success
    ? `${admin}/servicos-externos/${servicePath}?oauth=ok`
    : `${admin}/servicos-externos/${servicePath}?oauth=error&message=${encodeURIComponent(message || 'oauth_failed')}`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <p>${success ? 'Autorização concluída. Esta aba pode ser fechada.' : `Falha: ${String(message || 'erro').replace(/[<>&]/g, '')}`}</p>
  <script>
    (function () {
      var payload = ${payload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, ${JSON.stringify(admin)});
        }
      } catch (e) {}
      try { window.close(); } catch (e) {}
      setTimeout(function () { location.replace(${JSON.stringify(redirect)}); }, 400);
    })();
  </script>
</body>
</html>`;
}

function meOauthResultHtml(opts) {
  return oauthResultHtml({
    ...opts,
    type: 'melhorenvio-oauth',
    servicePath: 'melhorenvio',
    title: 'Melhor Envio OAuth',
  });
}

function googleOauthResultHtml(opts) {
  return oauthResultHtml({
    ...opts,
    type: 'google-calendar-oauth',
    servicePath: 'google_calendar',
    title: 'Google Calendar OAuth',
  });
}

const OAUTH_HTML_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'";

function sendOauthHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', OAUTH_HTML_CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(200).send(html);
}

/** OAuth callback must be public — Melhor Envio redirects the browser here without our session.
 *  Sem requireModule: auth precisa funcionar com o módulo ainda desligado no Admin. */
router.get('/melhorenvio/oauth/callback', async (req, res, next) => {
  const asJson = String(req.query.format || '') === 'json';
  try {
    assertOAuthState('melhorenvio', req.query.state);
    const code = req.query.code;
    if (!code) {
      const tip =
        'code OAuth ausente. Não abra esta URL manualmente — use “Autorizar no Melhor Envio” no admin. Após autorizar, o Melhor Envio redireciona para cá com ?code=…';
      if (asJson) throw new AppError(400, 'VALIDATION_ERROR', tip);
      return sendOauthHtml(res, meOauthResultHtml({ ok: false, message: tip }));
    }
    await meAuth.exchangeCode(code);
    if (asJson) return res.json(ok({ ok: true }));
    return sendOauthHtml(res, meOauthResultHtml({ ok: true }));
  } catch (err) {
    if (asJson) return next(err);
    return sendOauthHtml(res, meOauthResultHtml({ ok: false, message: err.message || 'oauth_failed' }));
  }
});

const gcAuth = require('../../services/google_calendar/auth');

/** Sem requireModule: auth precisa funcionar com o módulo ainda desligado no Admin. */
router.get('/google_calendar/oauth/callback', async (req, res, next) => {
  const asJson = String(req.query.format || '') === 'json';
  try {
    assertOAuthState('google_calendar', req.query.state);
    const code = req.query.code;
    if (!code) {
      const tip =
        'code OAuth ausente. Use “Autorizar com Google” no admin. Após autorizar, o Google redireciona para cá com ?code=…';
      if (asJson) throw new AppError(400, 'VALIDATION_ERROR', tip);
      return sendOauthHtml(res, googleOauthResultHtml({ ok: false, message: tip }));
    }
    await gcAuth.exchangeCode(code);
    if (asJson) return res.json(ok({ ok: true }));
    return sendOauthHtml(res, googleOauthResultHtml({ ok: true }));
  } catch (err) {
    if (asJson) return next(err);
    return sendOauthHtml(res, googleOauthResultHtml({ ok: false, message: err.message || 'oauth_failed' }));
  }
});

/** Public CIAP-2 status (no auth) — used by Kunk and cadastramento. */
const ciap2Router = require('./ciap2');
router.use('/ciap2', ciap2Router);

/**
 * Public Pagarme webhooks + SouCannabis outbound (no session).
 * Mounted before authenticate. Authenticated module routes are mounted later.
 */
const pagarmeSvc = require('../../services/pagarme');
const scSvc = require('../../services/soucannabis_orders');
const { checkRateLimit } = require('../../utils/rateLimit');

async function assertPagarmeWebhookAuth(req, body) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const rl = checkRateLimit(`pagarme-webhook:${ip}`, { limit: 120, windowMs: 60 * 1000 });
  if (!rl.ok) {
    throw new AppError(429, 'RATE_LIMITED', 'Muitas tentativas no webhook. Aguarde um momento.');
  }
  const authOk = await pagarmeSvc.webhook.verifyBasicAuth(req);
  if (authOk) return;
  await pagarmeSvc.hooksSetup.captureValidationEvent(body, { auth_ok: false });
  const authDebug = await pagarmeSvc.webhook.basicAuthDebug(req);
  console.warn('[pagarme-webhook] auth rejected', authDebug);
  throw new AppError(
    401,
    'UNAUTHORIZED',
    'Webhook auth inválida — confira usuário/senha HTTP Basic no Admin e no painel Pagar.me'
  );
}

router.post('/pagarme/webhook', async (req, res, next) => {
  try {
    const body = req.body || {};
    await assertPagarmeWebhookAuth(req, body);
    const validation_capture = await pagarmeSvc.hooksSetup.captureValidationEvent(body, {
      auth_ok: true,
    });
    const handled = await pagarmeSvc.webhook.handleOrderPaid(body);
    res.json(ok({ ...handled, validation_capture }));
  } catch (err) {
    next(err);
  }
});

router.post('/pagarme/webhook-service', async (req, res, next) => {
  try {
    const body = req.body || {};
    await assertPagarmeWebhookAuth(req, body);
    const validation_capture = await pagarmeSvc.hooksSetup.captureValidationEvent(body, {
      auth_ok: true,
    });
    const handled = await pagarmeSvc.webhook.handleServicePaid(body);
    res.json(ok({ ...handled, validation_capture }));
  } catch (err) {
    next(err);
  }
});

const scOutboundPublic = Router();
scOutboundPublic.post('/auth/token', async (req, res, next) => {
  try {
    const body = req.body || {};
    res.json(
      await scSvc.outbound.issueOutboundToken({
        client_id: body.client_id,
        client_secret: body.client_secret,
      })
    );
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.use(async (req, res, next) => {
  try {
    await scSvc.outbound.assertOutboundAuth(req);
    next();
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.get('/orders/:external_id', async (req, res, next) => {
  try {
    const order = await scSvc.outbound.findOrderByExternalId(req.params.external_id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
    res.json(ok(order));
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.patch('/orders/:external_id', async (req, res, next) => {
  try {
    res.json(
      ok(
        await scSvc.outbound.applyOutboundPatch(req.params.external_id, req.body || {}, {
          http_method: 'PATCH',
          http_path: `/api/v1/modules/soucannabis_orders/outbound/orders/${req.params.external_id}`,
        })
      )
    );
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.delete('/orders/:external_id', async (req, res, next) => {
  try {
    res.json(
      ok(
        await scSvc.outbound.applyOutboundDelete(req.params.external_id, {
          http_method: 'DELETE',
          http_path: `/api/v1/modules/soucannabis_orders/outbound/orders/${req.params.external_id}`,
        })
      )
    );
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.get('/audit', async (req, res, next) => {
  try {
    const data = await scSvc.auditLog.listAudit({
      from: req.query.from,
      to: req.query.to,
      order_code: req.query.order_code,
      soucannabis_order_id: req.query.soucannabis_order_id,
      local_order_id: req.query.local_order_id,
      direction: req.query.direction,
      source: req.query.source,
      correlation_id: req.query.correlation_id,
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});
scOutboundPublic.post('/pagarme/recipients', async (req, res, next) => {
  try {
    const force = Boolean(req.body?.force);
    const body = { ...(req.body || {}) };
    delete body.force;
    const data = await pagarmeSvc.createSoucannabisRecipient(body, { force });
    await scSvc.auditLog.recordSafe({
      direction: 'inbound',
      source: 'pagarme_recipient',
      action: 'create',
      http_method: 'POST',
      http_path: '/api/v1/modules/soucannabis_orders/outbound/pagarme/recipients',
      status: 'ok',
      request_payload: body,
      response_payload: data,
    });
    res.json(ok(data));
  } catch (err) {
    await scSvc.auditLog.recordSafe({
      direction: 'inbound',
      source: 'pagarme_recipient',
      action: 'create',
      http_method: 'POST',
      http_path: '/api/v1/modules/soucannabis_orders/outbound/pagarme/recipients',
      status: 'error',
      error_code: err?.code || 'RECIPIENT_ERROR',
      error_message: err?.message || String(err),
      request_payload: { ...(req.body || {}), force: undefined, client_secret: undefined },
    });
    next(err);
  }
});
scOutboundPublic.get('/users/:user_code', async (req, res, next) => {
  try {
    const { query } = require('../../db/pool');
    const code = String(req.params.user_code || '').trim();
    const result = await query(
      `SELECT id, user_code, associate_name, associate_last_name, email_account,
              mobile_number, street, street_number, neighborhood, complement, city, state, cep, associate_cpf
       FROM users WHERE user_code::text = $1 LIMIT 1`,
      [code]
    );
    const user = result.rows[0];
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Associado não encontrado');
    res.json(
      ok({
        id: user.id,
        user_code: user.user_code,
        name: [user.associate_name, user.associate_last_name].filter(Boolean).join(' ').trim(),
        email: user.email_account,
        mobile_number: user.mobile_number,
        cpf: user.associate_cpf,
        address: {
          street: user.street,
          number: user.street_number,
          neighborhood: user.neighborhood,
          complement: user.complement,
          city: user.city,
          state: user.state,
          cep: user.cep,
        },
      })
    );
  } catch (err) {
    next(err);
  }
});
router.use('/soucannabis_orders/outbound', scOutboundPublic);

/** Public webhooks Pedidos SC — auth com credenciais outbound (sem sessão). */
const scWebhooksPublic = Router();
scWebhooksPublic.post('/auth/token', async (req, res, next) => {
  try {
    const body = req.body || {};
    res.json(
      await scSvc.webhookSync.issueWebhookToken({
        client_id: body.client_id,
        client_secret: body.client_secret,
      })
    );
  } catch (err) {
    next(err);
  }
});
scWebhooksPublic.post('/orders/sync', async (req, res, next) => {
  try {
    await scSvc.webhookSync.assertWebhookAuth(req);
    res.json(
      ok(
        await scSvc.webhookSync.applyManualOrdersSync(req.body || {}, {
          http_method: 'POST',
          http_path: '/api/v1/modules/soucannabis_orders/webhooks/orders/sync',
        })
      )
    );
  } catch (err) {
    next(err);
  }
});
router.use('/soucannabis_orders/webhooks', scWebhooksPublic);

router.use(authenticate);

router.get('/', authorizeAdmin, async (req, res, next) => {
  try {
    const { isModuleEnabled } = require('../../services/moduleFlags');
    const list = [];
    for (const name of MODULE_NAMES) {
      list.push({
        name,
        enabled: await isModuleEnabled(name),
      });
    }
    res.json(ok(list));
  } catch (err) {
    next(err);
  }
});

const loggiRouter = require('./loggi');
const melhorenvioRouter = require('./melhorenvio');
const geoapifyRouter = require('./geoapify');
const googleCalendarRouter = require('./google_calendar');
const pagarmeRouter = require('./pagarme');
const soucannabisOrdersRouter = require('./soucannabis_orders');
const utalkRouter = require('./utalk');

router.use('/loggi', loggiRouter);
router.use('/melhorenvio', melhorenvioRouter);
router.use('/geoapify', geoapifyRouter);
router.use('/google_calendar', googleCalendarRouter);
router.use('/pagarme', pagarmeRouter);
router.use('/soucannabis_orders', soucannabisOrdersRouter);
router.use('/utalk', utalkRouter);

const IMPLEMENTED = new Set([
  'loggi',
  'melhorenvio',
  'geoapify',
  'google_calendar',
  'ciap2',
  'pagarme',
  'soucannabis_orders',
  'utalk',
]);

for (const name of MODULE_NAMES) {
  if (IMPLEMENTED.has(name)) continue;
  router.get(`/${name}`, requireModule(name), (req, res) => {
    res.json(ok({ module: name, status: 'enabled', message: 'Stub ativo' }));
  });
  router.get(`/${name}/status`, requireModule(name), (req, res) => {
    res.json(ok({ module: name, enabled: true }));
  });
}

module.exports = { router, MODULE_NAMES, requireModule };
