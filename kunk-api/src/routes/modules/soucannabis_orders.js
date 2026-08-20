'use strict';

const { Router } = require('express');
const { requireModule } = require('./requireModule');
const { authorizeAdmin } = require('../../middleware/authorize');
const { ok, AppError } = require('../../utils/response');
const sc = require('../../services/soucannabis_orders');
const pagarme = require('../../services/pagarme');
const { query } = require('../../db/pool');

const router = Router();

/** Outbound (SC → OSS) — public with outbound token (no session). */
const outboundRouter = Router();

outboundRouter.post('/auth/token', async (req, res, next) => {
  try {
    const body = req.body || {};
    const token = await sc.outbound.issueOutboundToken({
      client_id: body.client_id,
      client_secret: body.client_secret,
    });
    res.json(token);
  } catch (err) {
    next(err);
  }
});

outboundRouter.use(async (req, res, next) => {
  try {
    await sc.outbound.assertOutboundAuth(req);
    next();
  } catch (err) {
    next(err);
  }
});

outboundRouter.get('/orders/:external_id', async (req, res, next) => {
  try {
    const order = await sc.outbound.findOrderByExternalId(req.params.external_id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
    res.json(ok(order));
  } catch (err) {
    next(err);
  }
});

outboundRouter.patch('/orders/:external_id', async (req, res, next) => {
  try {
    const updated = await sc.outbound.applyOutboundPatch(req.params.external_id, req.body || {}, {
      http_method: 'PATCH',
      http_path: `/api/v1/modules/soucannabis_orders/outbound/orders/${req.params.external_id}`,
    });
    res.json(ok(updated));
  } catch (err) {
    next(err);
  }
});

outboundRouter.delete('/orders/:external_id', async (req, res, next) => {
  try {
    const result = await sc.outbound.applyOutboundDelete(req.params.external_id, {
      http_method: 'DELETE',
      http_path: `/api/v1/modules/soucannabis_orders/outbound/orders/${req.params.external_id}`,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

outboundRouter.get('/audit', async (req, res, next) => {
  try {
    const data = await sc.auditLog.listAudit({
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

outboundRouter.post('/pagarme/recipients', async (req, res, next) => {
  try {
    const force = Boolean(req.body?.force);
    const body = { ...(req.body || {}) };
    delete body.force;
    const data = await pagarme.createSoucannabisRecipient(body, { force });
    await sc.auditLog.recordSafe({
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
    await sc.auditLog.recordSafe({
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

outboundRouter.get('/users/:user_code', async (req, res, next) => {
  try {
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

router.use('/outbound', outboundRouter);

/**
 * Setup / status / teste / credenciais outbound ficam FORA do requireModule.
 * Senão: módulo off → 503 → impossível autenticar para depois ativar.
 */
router.get('/status', async (req, res, next) => {
  try {
    res.json(ok(await sc.getStatus()));
  } catch (err) {
    next(err);
  }
});

router.get('/me', authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await sc.getMeCached()));
  } catch (err) {
    next(err);
  }
});

router.post('/test', authorizeAdmin, async (req, res, next) => {
  try {
    const credentialsService = require('../../services/credentialsService');
    const creds = await credentialsService.resolveAll('soucannabis_orders');
    const result = await sc.runTest(creds);
    await credentialsService.markTestResult('soucannabis_orders', true);
    res.json(ok(result));
  } catch (err) {
    const credentialsService = require('../../services/credentialsService');
    await credentialsService.markTestResult('soucannabis_orders', false).catch(() => {});
    next(err);
  }
});

router.get('/outbound-credentials', authorizeAdmin, async (req, res, next) => {
  try {
    const reveal = String(req.query.reveal || '') === '1';
    const creds = await sc.outbound.ensureOutboundCredentials();
    const publicMeta = await require('../../services/credentialsService').listPublic(
      'soucannabis_orders_outbound'
    );
    const { publicApiBase } = require('../../utils/publicApiUrl');
    const baseUrl = publicApiBase(req);
    const webhookPaths = sc.webhookSync.webhookPaths();
    res.json(
      ok({
        client_id: creds.client_id,
        // Admin precisa colar o secret na SC; reveal=1 retorna o valor (somente Administrador).
        client_secret: reveal ? creds.client_secret : undefined,
        has_secret: Boolean(creds.client_secret),
        credentials: publicMeta,
        base_url: baseUrl,
        paths: {
          token: '/api/v1/modules/soucannabis_orders/outbound/auth/token',
          orders: '/api/v1/modules/soucannabis_orders/outbound/orders',
          recipients: '/api/v1/modules/soucannabis_orders/outbound/pagarme/recipients',
          users: '/api/v1/modules/soucannabis_orders/outbound/users/:user_code',
        },
        webhooks: {
          auth: 'soucannabis_orders_outbound credentials (client_id / client_secret)',
          base_url: baseUrl,
          paths: webhookPaths,
          orders_sync_url: `${baseUrl}${webhookPaths.orders_sync}`,
          token_url: `${baseUrl}${webhookPaths.token}`,
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/webhook-info', authorizeAdmin, async (req, res, next) => {
  try {
    const { publicApiBase } = require('../../utils/publicApiUrl');
    const baseUrl = publicApiBase(req);
    const paths = sc.webhookSync.webhookPaths();
    res.json(
      ok({
        auth: 'Credenciais outbound Pedidos SouCannabis (client_id / client_secret)',
        base_url: baseUrl,
        paths,
        orders_sync_url: `${baseUrl}${paths.orders_sync}`,
        token_url: `${baseUrl}${paths.token}`,
        example: {
          token: {
            method: 'POST',
            url: `${baseUrl}${paths.token}`,
            body: { client_id: '…', client_secret: '…' },
          },
          sync: {
            method: 'POST',
            url: `${baseUrl}${paths.orders_sync}`,
            headers: { Authorization: 'Bearer <access_token>' },
            body: {
              orders: [
                {
                  id: 47368,
                  external_id: 'uuid-do-pedido-oss',
                  status: 'Aguardando aprovação',
                  tracking_code: 'ABC123',
                  external_delivery_type: 'loggi',
                },
              ],
            },
          },
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

// Catálogo / sync exigem módulo ativo no Admin.
router.use(requireModule('soucannabis_orders'));

router.get('/', (req, res) => {
  res.json(ok({ module: 'soucannabis_orders', status: 'enabled' }));
});

router.get('/products', async (req, res, next) => {
  try {
    res.json(ok(await sc.listProducts()));
  } catch (err) {
    next(err);
  }
});

router.get('/tags', async (req, res, next) => {
  try {
    res.json(ok(await sc.listTags()));
  } catch (err) {
    next(err);
  }
});

router.post('/sync/order/:id', async (req, res, next) => {
  try {
    const result = await sc.syncOrders.createIfNeeded(Number(req.params.id), {
      external_payment_info: req.body?.external_payment_info,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
