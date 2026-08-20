'use strict';

const { Router } = require('express');
const credentialsService = require('../services/credentialsService');
const storeFreight = require('../services/storeFreightConfig');
const systemConfigService = require('../services/systemConfigService');
const loggiClient = require('../services/loggi/client');
const meAuth = require('../services/melhorenvio/auth');
const geoClient = require('../services/geoapify/client');
const gcAuth = require('../services/google_calendar/auth');
const { ok, AppError } = require('../utils/response');
const { query } = require('../db/pool');
const { oauthRedirectUri } = require('../utils/publicApiUrl');

const SERVICES = [
  'loggi',
  'melhorenvio',
  'geoapify',
  'google_calendar',
  'email',
  'pagarme',
  'soucannabis_orders',
  'utalk',
];
const FREIGHT_SERVICES = new Set(['loggi', 'melhorenvio']);
const emailClient = require('../services/email');
const pagarmeService = require('../services/pagarme');
const scOrdersService = require('../services/soucannabis_orders');
const utalkClient = require('../services/utalk/client');
const utalkAttendants = require('../services/utalk/attendants');
const { isModuleEnabled } = require('../services/moduleFlags');

const AUTH_HINT_FIELDS = new Set([
  'access_token',
  'refresh_token',
  'secret_key',
  'api_key',
  'api_token',
  'client_secret',
  'pass',
  'client_id',
]);

const router = Router();

function serviceOrThrow(service) {
  if (!SERVICES.includes(service)) {
    throw new AppError(404, 'NOT_FOUND', `Serviço ${service} desconhecido`);
  }
  return service;
}

/**
 * Exige autenticação válida antes de habilitar o módulo (exceto regras especiais de pagarme/SC).
 */
async function assertAuthenticatedToEnable(service) {
  if (service === 'pagarme') {
    return; // regras próprias abaixo
  }

  const credentials = await credentialsService.listPublic(service);

  if (service === 'melhorenvio') {
    const access = credentials.find((c) => c.field_key === 'access_token');
    if (!access?.has_value) {
      throw new AppError(400, 'NOT_AUTHENTICATED', 'Autentique o Melhor Envio antes de ativar o módulo');
    }
    return;
  }

  if (service === 'google_calendar') {
    const access = credentials.find((c) => c.field_key === 'access_token');
    const refresh = credentials.find((c) => c.field_key === 'refresh_token');
    if (!(access?.has_value || refresh?.has_value)) {
      throw new AppError(
        400,
        'NOT_AUTHENTICATED',
        'Autentique o Google Calendar antes de ativar o módulo'
      );
    }
    return;
  }

  if (service === 'soucannabis_orders') {
    // Dependências Pagar.me são validadas à parte; ainda exige credenciais SC quando existirem.
    const authCreds = credentials.filter((c) => c.has_value && AUTH_HINT_FIELDS.has(c.field_key));
    if (authCreds.length && authCreds.some((c) => c.last_test_ok === false)) {
      throw new AppError(
        400,
        'NOT_AUTHENTICATED',
        'A autenticação de Pedidos SouCannabis falhou. Corrija as credenciais antes de ativar.'
      );
    }
    return;
  }

  const authCreds = credentials.filter((c) => c.has_value && AUTH_HINT_FIELDS.has(c.field_key));
  if (!authCreds.length) {
    throw new AppError(400, 'NOT_AUTHENTICATED', 'Autentique o módulo antes de ativá-lo');
  }
  if (authCreds.some((c) => c.last_test_ok === false)) {
    throw new AppError(
      400,
      'NOT_AUTHENTICATED',
      'A autenticação falhou. Corrija as credenciais antes de ativar o módulo.'
    );
  }
}

async function getModuleConfigFlags(service) {
  const { isModuleEnabled, asBool: flagBool, moduleEnabledDefault } = require('../services/moduleFlags');
  const enabledKey = `modules.${service}.enabled`;
  const quoteKey = `modules.${service}.use_for_quote`;
  const labelKey = `modules.${service}.use_for_label`;
  const trackingKey = `modules.${service}.use_for_tracking`;
  const validationKey = `modules.${service}.use_for_validation`;
  const schedulingKey = `modules.${service}.use_for_scheduling`;
  const primaryKey = `modules.${service}.primary_calendar_id`;
  const useOrdersKey = `modules.${service}.use_for_orders`;
  const useServicesKey = `modules.${service}.use_for_services`;
  const syncProductsKey = `modules.${service}.sync_products`;
  const syncTagsKey = `modules.${service}.sync_tags`;
  const syncOrdersKey = `modules.${service}.sync_orders`;
  const assocRecipientKey = `modules.${service}.association_recipient_id`;
  const scRecipientKey = `modules.${service}.soucannabis_recipient_id`;
  const triageMsgEnabledKey = `modules.${service}.triage_message_enabled`;
  const triageMsgKey = `modules.${service}.triage_message`;
  const result = await query(
    `SELECT key, value FROM system_configs
     WHERE system = 'modules' AND key = ANY($1::text[])`,
    [[
      enabledKey,
      quoteKey,
      labelKey,
      trackingKey,
      validationKey,
      schedulingKey,
      primaryKey,
      useOrdersKey,
      useServicesKey,
      syncProductsKey,
      syncTagsKey,
      syncOrdersKey,
      assocRecipientKey,
      scRecipientKey,
      triageMsgEnabledKey,
      triageMsgKey,
    ]]
  );
  const values = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  const hasAdminEnabled =
    values[enabledKey] != null && values[enabledKey] !== '';
  const flags = {
    /** Effective runtime flag (admin overrides env). */
    enabled: await isModuleEnabled(service),
    /** Value stored in Admin, if any. */
    config_enabled: hasAdminEnabled ? flagBool(values[enabledKey], false) : null,
    /** Default quando Admin nunca gravou (uso no sistema sempre off). */
    env_default: moduleEnabledDefault(service),
    source: hasAdminEnabled ? 'admin' : 'default',
  };
  if (FREIGHT_SERVICES.has(service)) {
    const scOn = await isModuleEnabled('soucannabis_orders');
    const quoteDefault = false;
    flags.use_for_quote = scOn ? false : flagBool(values[quoteKey], quoteDefault);
    flags.use_for_label = scOn ? false : flagBool(values[labelKey], false);
    flags.use_for_tracking = flagBool(values[trackingKey], false);
    flags.sc_blocks_quote_label = scOn;
  }
  if (service === 'geoapify') {
    flags.use_for_validation = flagBool(values[validationKey], false);
  }
  if (service === 'google_calendar') {
    flags.use_for_scheduling = flagBool(values[schedulingKey], false);
    flags.primary_calendar_id = values[primaryKey] || null;
  }
  if (service === 'pagarme') {
    flags.use_for_orders = flagBool(values[useOrdersKey], false);
    flags.use_for_services = flagBool(values[useServicesKey], false);
    flags.association_recipient_id = values[assocRecipientKey] || null;
    flags.soucannabis_recipient_id = values[scRecipientKey] || null;
  }
  if (service === 'soucannabis_orders') {
    flags.sync_products = flagBool(values[syncProductsKey], false);
    flags.sync_tags = flagBool(values[syncTagsKey], false);
    flags.sync_orders = flagBool(values[syncOrdersKey], false);
  }
  if (service === 'utalk') {
    const { DEFAULT_TRIAGE_MESSAGE } = require('../services/utalk/triageMessage');
    flags.triage_message_enabled = flagBool(values[triageMsgEnabledKey], false);
    flags.triage_message =
      values[triageMsgKey] != null && String(values[triageMsgKey]).trim() !== ''
        ? String(values[triageMsgKey])
        : DEFAULT_TRIAGE_MESSAGE;
  }
  return flags;
}

async function upsertModuleFlag(key, value, description, valueType = 'boolean') {
  const serialized =
    valueType === 'boolean' ? (value ? 'true' : 'false') : value == null ? null : String(value);
  const existing = await query(
    `SELECT id FROM system_configs WHERE system = 'modules' AND key = $1 LIMIT 1`,
    [key]
  );
  if (existing.rows[0]?.id) {
    await systemConfigService.updateConfig(existing.rows[0].id, { value: serialized });
  } else {
    await systemConfigService.createConfig({
      system: 'modules',
      key,
      value: serialized,
      value_type: valueType,
      is_sensitive: false,
      allow_hardcoded: false,
      description,
    });
  }
}

router.get('/', async (req, res, next) => {
  try {
    const store = await storeFreight.getStoreFreightConfig();
    let storeReady = true;
    let storeMissing = [];
    try {
      storeFreight.assertShipFrom(store.ship_from);
      storeFreight.assertPackage(store.package);
      storeFreight.assertContentDeclaration(store.content_declaration);
    } catch (err) {
      storeReady = false;
      storeMissing = err.details?.missing || [];
    }

    const list = [];
    for (const service of SERVICES) {
      const flags = await getModuleConfigFlags(service);
      const credentials = await credentialsService.listPublic(service);
      const item = { service, ...flags, credentials };
      if (FREIGHT_SERVICES.has(service)) {
        item.store_freight_ready = storeReady;
        item.store_freight_missing = storeMissing;
      }
      list.push(item);
    }
    res.json(
      ok({
        services: list,
        store_incomplete: {
          ship_from: storeMissing.some((m) => String(m).includes('ship_from')) || !store.ship_from,
          package:
            storeMissing.some((m) => String(m).includes('package')) || !store.package,
          content_declaration:
            storeMissing.some((m) => String(m).includes('content_declaration')) ||
            !store.content_declaration,
        },
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/utalk/attendants', async (req, res, next) => {
  try {
    const attendants = await utalkAttendants.listAttendantsForAdmin();
    res.json(ok({ attendants }));
  } catch (err) {
    next(err);
  }
});

router.put('/utalk/attendants/:userCode', async (req, res, next) => {
  try {
    const attendant = await utalkAttendants.updateAttendantUtalkId(
      req.params.userCode,
      req.body?.utalk_id
    );
    res.json(ok({ attendant }));
  } catch (err) {
    next(err);
  }
});

router.get('/:service', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    let [flags, credentials, storeCfg] = await Promise.all([
      getModuleConfigFlags(service),
      credentialsService.listPublic(service),
      FREIGHT_SERVICES.has(service)
        ? storeFreight.getStoreFreightConfig()
        : Promise.resolve(null),
    ]);
    const payload = { service, ...flags, credentials };
    if (FREIGHT_SERVICES.has(service) && storeCfg) {
      try {
        storeFreight.assertShipFrom(storeCfg.ship_from);
        storeFreight.assertPackage(storeCfg.package);
        storeFreight.assertContentDeclaration(storeCfg.content_declaration);
        payload.store_freight_ready = true;
      } catch (err) {
        payload.store_freight_ready = false;
        payload.store_freight_missing = err.details?.missing || [];
      }
    }
    if (service === 'melhorenvio') {
      await meAuth.ensureEnvironmentRow();
      credentials = await credentialsService.listPublic(service);

      const envCred = credentials.find((c) => c.field_key === 'environment');
      const apiCred = credentials.find((c) => c.field_key === 'api_base_url');
      const environment = envCred?.value
        ? meAuth.resolveEnvironmentKey(envCred.value)
        : apiCred?.value
          ? meAuth.detectEnvironmentFromApiBase(apiCred.value)
          : 'production';
      const pinned = meAuth.ME_ENVIRONMENTS[environment].api_base_url;

      const accessCred = credentials.find((c) => c.field_key === 'access_token');
      const refreshCred = credentials.find((c) => c.field_key === 'refresh_token');
      payload.oauth = {
        authenticated: Boolean(accessCred?.has_value),
        has_refresh: Boolean(refreshCred?.has_value),
      };
      payload.environment = environment;
      payload.me_urls = meAuth.ME_ENVIRONMENTS;

      // Pin display values without writing on every GET
      const redirectUri = oauthRedirectUri('melhorenvio');
      payload.oauth_redirect_uri = redirectUri;
      payload.credentials = credentials.map((c) => {
        if (c.field_key === 'api_base_url') {
          return { ...c, value: pinned, has_value: true, source: c.source || 'db' };
        }
        if (c.field_key === 'environment') {
          return { ...c, value: environment, has_value: true, source: c.source || 'db' };
        }
        if (c.field_key === 'redirect_uri') {
          return { ...c, value: redirectUri, has_value: true, source: 'computed' };
        }
        return c;
      });
      payload.hidden_cred_fields = [
        'access_token',
        'refresh_token',
        'environment',
        'api_base_url',
        'redirect_uri',
      ];
    }
    if (service === 'google_calendar') {
      const needed = ['client_id', 'client_secret', 'redirect_uri'];
      const hasFormRows = needed.every((k) => credentials.some((c) => c.field_key === k));
      if (!hasFormRows) {
        await gcAuth.ensureCredentialRows();
        credentials = await credentialsService.listPublic(service);
      }
      const redirectUri = oauthRedirectUri('google_calendar');
      payload.oauth_redirect_uri = redirectUri;
      payload.credentials = credentials.map((c) => {
        if (c.field_key === 'redirect_uri') {
          return { ...c, value: redirectUri, has_value: true, source: 'computed' };
        }
        return c;
      });
      const accessCred = credentials.find((c) => c.field_key === 'access_token');
      const refreshCred = credentials.find((c) => c.field_key === 'refresh_token');
      payload.oauth = {
        authenticated: Boolean(accessCred?.has_value || refreshCred?.has_value),
        has_refresh: Boolean(refreshCred?.has_value),
      };
      payload.hidden_cred_fields = ['access_token', 'refresh_token', 'redirect_uri'];
    }
    if (service === 'email') {
      if (!(credentials || []).length) {
        await emailClient.ensureCredentialRows();
        credentials = await credentialsService.listPublic(service);
        payload.credentials = credentials;
      }
    }
    if (service === 'loggi') {
      await loggiClient.ensureCredentialRows();
      credentials = await credentialsService.listPublic(service);
      payload.credentials = credentials;
    }
    if (service === 'geoapify') {
      await geoClient.ensureCredentialRows();
      credentials = await credentialsService.listPublic(service);
      payload.credentials = credentials;
    }
    if (service === 'utalk') {
      await utalkClient.ensureCredentialRows();
      credentials = await credentialsService.listPublic(service);
      payload.credentials = credentials;
      try {
        payload.attendants = await utalkAttendants.listAttendantsForAdmin();
      } catch (err) {
        payload.attendants = [];
        payload.attendants_error = err.message || String(err);
      }
    }
    if (service === 'pagarme') {
      await pagarmeService.ensureCredentialRows();
      credentials = await credentialsService.listPublic(service);
      payload.credentials = credentials;
      const urls = pagarmeService.hooksSetup.getWebhookUrls(req);
      payload.webhook_urls = {
        orders: urls.orders,
        services: urls.services,
      };
      try {
        payload.pagarme_status = await pagarmeService.getStatus(req);
      } catch (err) {
        payload.pagarme_status = { error: err.message || String(err) };
      }
      // Efetivo: flag Admin + Secret key. Webhooks (passo 3) não bloqueiam o módulo.
      const effectivelyOn = await isModuleEnabled('pagarme');
      payload.enabled = effectivelyOn;
      if (!effectivelyOn && payload.config_enabled === true) {
        await upsertModuleFlag(
          'modules.pagarme.enabled',
          false,
          'Módulo pagarme desligado: exige Secret key autenticada'
        );
        payload.config_enabled = false;
        payload.source = 'admin';
      }
    }
    if (service === 'soucannabis_orders') {
      await scOrdersService.ensureCredentialRows();
      credentials = await credentialsService.listPublic(service);
      payload.credentials = credentials;
      payload.hidden_cred_fields = ['access_token'];
      try {
        payload.sc_status = await scOrdersService.getStatus();
      } catch (err) {
        payload.sc_status = { error: err.message || String(err) };
      }
    }
    res.json(ok(payload));
  } catch (err) {
    next(err);
  }
});

router.patch('/:service', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    const body = req.body || {};

    const enablingFreight =
      FREIGHT_SERVICES.has(service) &&
      (body.use_for_quote === true || body.use_for_label === true || body.enabled === true);
    if (enablingFreight) {
      const cfg = await storeFreight.getStoreFreightConfig();
      try {
        storeFreight.assertShipFrom(cfg.ship_from);
        storeFreight.assertPackage(cfg.package);
        storeFreight.assertContentDeclaration(cfg.content_declaration);
      } catch (err) {
        const label = service === 'loggi' ? 'Loggi' : 'Melhor Envio';
        throw new AppError(
          400,
          'CONFIG_INCOMPLETE',
          `Preencha remetente, caixa e declaração de conteúdo em Serviços externos → Dados de envio antes de ativar o ${label}`,
          {
            missing: err.details?.missing || [
              'store.ship_from',
              'store.freight.package',
              'store.freight.content_declaration',
            ],
          }
        );
      }
    }

    if (body.use_for_quote !== undefined) {
      if (FREIGHT_SERVICES.has(service)) {
        const { isModuleEnabled } = require('../services/moduleFlags');
        if (await isModuleEnabled('soucannabis_orders') && body.use_for_quote === true) {
          throw new AppError(
            400,
            'SC_BLOCKS_FREIGHT',
            'Com Pedidos SouCannabis ativo, cotação Loggi/Melhor Envio fica desligada. Use a opção Tracking.'
          );
        }
      }
      await upsertModuleFlag(
        `modules.${service}.use_for_quote`,
        Boolean(body.use_for_quote),
        `Usar ${service} no cálculo de frete`
      );
    }
    if (body.use_for_label !== undefined) {
      if (FREIGHT_SERVICES.has(service)) {
        const { isModuleEnabled } = require('../services/moduleFlags');
        if (await isModuleEnabled('soucannabis_orders') && body.use_for_label === true) {
          throw new AppError(
            400,
            'SC_BLOCKS_FREIGHT',
            'Com Pedidos SouCannabis ativo, etiqueta Loggi/Melhor Envio fica desligada. Use a opção Tracking.'
          );
        }
      }
      await upsertModuleFlag(
        `modules.${service}.use_for_label`,
        Boolean(body.use_for_label),
        `Usar ${service} na geração de etiqueta`
      );
    }
    if (body.use_for_tracking !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.use_for_tracking`,
        Boolean(body.use_for_tracking),
        `Usar ${service} na consulta de rastreio`
      );
    }
    if (body.use_for_validation !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.use_for_validation`,
        Boolean(body.use_for_validation),
        `Usar ${service} na verificação de endereço`
      );
    }
    if (body.use_for_scheduling !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.use_for_scheduling`,
        Boolean(body.use_for_scheduling),
        `Usar ${service} no agendamento de serviços`
      );
    }
    if (body.primary_calendar_id !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.primary_calendar_id`,
        body.primary_calendar_id || null,
        'Calendário principal da associação',
        'string'
      );
    }
    if (body.use_for_orders !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.use_for_orders`,
        Boolean(body.use_for_orders),
        `Usar ${service} em pedidos`
      );
    }
    if (body.use_for_services !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.use_for_services`,
        Boolean(body.use_for_services),
        `Usar ${service} em serviços`
      );
    }
    if (body.sync_products !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.sync_products`,
        Boolean(body.sync_products),
        'Sincronizar produtos SouCannabis'
      );
    }
    if (body.sync_tags !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.sync_tags`,
        Boolean(body.sync_tags),
        'Sincronizar tags SouCannabis'
      );
    }
    if (body.sync_orders !== undefined) {
      await upsertModuleFlag(
        `modules.${service}.sync_orders`,
        Boolean(body.sync_orders),
        'Sincronizar pedidos SouCannabis'
      );
    }
    if (body.association_recipient_id !== undefined) {
      await upsertModuleFlag(
        `modules.pagarme.association_recipient_id`,
        body.association_recipient_id ? String(body.association_recipient_id).trim() : null,
        'Recipient Pagarme da associação',
        'string'
      );
    }
    if (body.soucannabis_recipient_id !== undefined) {
      await upsertModuleFlag(
        `modules.pagarme.soucannabis_recipient_id`,
        body.soucannabis_recipient_id ? String(body.soucannabis_recipient_id).trim() : null,
        'Recipient Pagarme SouCannabis',
        'string'
      );
    }
    if (service === 'utalk' && body.triage_message_enabled !== undefined) {
      if (body.triage_message_enabled === true) {
        const creds = await credentialsService.resolveAll('utalk');
        try {
          utalkClient.assertFromPhoneE164(creds.from_phone);
        } catch (err) {
          throw new AppError(
            400,
            'CONFIG_INCOMPLETE',
            err.message ||
              'Cadastre from_phone no formato +55 e número completo antes de ativar a mensagem da triagem'
          );
        }
        const msgCfg = await require('../services/utalk/triageMessage').getTriageMessageConfig();
        const nextMsg =
          body.triage_message !== undefined
            ? String(body.triage_message || '').trim()
            : String(msgCfg.triage_message || '').trim();
        if (!nextMsg) {
          throw new AppError(
            400,
            'CONFIG_INCOMPLETE',
            'Escreva o texto da mensagem da triagem antes de ativar o envio'
          );
        }
      }
      await upsertModuleFlag(
        'modules.utalk.triage_message_enabled',
        Boolean(body.triage_message_enabled),
        'Enviar mensagem Utalk ao criar triagem pelo formulário público'
      );
    }
    if (service === 'utalk' && body.triage_message !== undefined) {
      await upsertModuleFlag(
        'modules.utalk.triage_message',
        body.triage_message == null ? '' : String(body.triage_message),
        'Texto da mensagem Utalk enviada ao criar triagem',
        'string'
      );
    }

    if (body.enabled !== undefined) {
      if (body.enabled === true) {
        await assertAuthenticatedToEnable(service);
      }
      if (service === 'pagarme' && body.enabled === true) {
        let pagarmeStatus;
        try {
          pagarmeStatus = await pagarmeService.getStatus(req);
        } catch (err) {
          throw new AppError(400, 'DEPENDENCY_PAGARME', err.message || 'Pagar.me indisponível');
        }
        if (!pagarmeStatus.credentials_complete) {
          throw new AppError(
            400,
            'CREDENTIAL_MISSING',
            'Autentique a Secret key do Pagar.me antes de ativar o módulo'
          );
        }
        const testPayment =
          pagarmeStatus.webhooks?.test_payment || pagarmeStatus.webhooks?.test_order;
        if (!testPayment?.order?.id) {
          throw new AppError(
            400,
            'TEST_PAYMENT_REQUIRED',
            'Crie um link de pagamento de teste (passo 2) antes de ativar o módulo'
          );
        }
      }
      if (service === 'soucannabis_orders' && body.enabled === true) {
        const pagarmeOn = await isModuleEnabled('pagarme');
        if (!pagarmeOn) {
          throw new AppError(400, 'DEPENDENCY_PAGARME', 'Ative o Pagar.me antes de Pedidos SouCannabis');
        }
        let pagarmeStatus;
        try {
          pagarmeStatus = await pagarmeService.getStatus();
        } catch (err) {
          throw new AppError(400, 'DEPENDENCY_PAGARME', err.message || 'Pagar.me indisponível');
        }
        if (pagarmeStatus.is_psp === false) {
          throw new AppError(400, 'PAGARME_NOT_PSP', 'Conta Pagar.me precisa ser PSP para Pedidos SouCannabis');
        }
        if (!pagarmeStatus.association_recipient_id) {
          throw new AppError(400, 'SPLIT_NOT_CONFIGURED', 'Configure o recipient da associação no Pagar.me');
        }
        if (!pagarmeStatus.soucannabis_recipient_id) {
          throw new AppError(400, 'SPLIT_NOT_CONFIGURED', 'Recipient SouCannabis ainda não foi criado (outbound)');
        }
        if (!pagarmeStatus.payment_percentage_ok) {
          throw new AppError(
            400,
            'PAYMENT_PERCENTAGE_NOT_INTEGER',
            'payment_percentage da SouCannabis precisa ser inteiro 0–100 (rode o teste OAuth)'
          );
        }
      }
      if (service === 'pagarme' && body.enabled === false) {
        const scOn = await isModuleEnabled('soucannabis_orders');
        if (scOn) {
          throw new AppError(
            400,
            'DEPENDENCY_SC_ACTIVE',
            'Desative Pedidos SouCannabis antes de desligar o Pagar.me'
          );
        }
      }
      await upsertModuleFlag(
        `modules.${service}.enabled`,
        Boolean(body.enabled),
        `Módulo ${service} habilitado (Admin)`
      );
    }
    const flags = await getModuleConfigFlags(service);
    res.json(
      ok({
        service,
        ...flags,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:service/credentials', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    const credentials = await credentialsService.listPublic(service);
    res.json(ok({ service, credentials }));
  } catch (err) {
    next(err);
  }
});

router.put('/:service/credentials', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    const fields = { ...(req.body?.fields || {}) };
    const runTest = req.body?.run_test !== false;

    if (service === 'loggi') {
      await loggiClient.ensureCredentialRows();
    }
    if (service === 'melhorenvio') {
      await meAuth.ensureCredentialRows();
    }
    if (service === 'geoapify') {
      await geoClient.ensureCredentialRows();
    }
    if (service === 'pagarme') {
      await pagarmeService.ensureCredentialRows();
    }
    if (service === 'soucannabis_orders') {
      await scOrdersService.ensureCredentialRows();
    }
    if (service === 'utalk') {
      await utalkClient.ensureCredentialRows();
    }

    if (service === 'melhorenvio') {
      await meAuth.ensureEnvironmentRow();
      const envKey = meAuth.resolveEnvironmentKey(
        fields.environment || (await meAuth.getEnvironment())
      );
      fields.environment = envKey;
      fields.api_base_url = meAuth.ME_ENVIRONMENTS[envKey].api_base_url;
    }

    if (service === 'google_calendar') {
      await gcAuth.ensureCredentialRows();
    }

    if (service === 'email') {
      await emailClient.ensureCredentialRows();
    }

    // Redirect URI is always computed by the API — never taken from the admin form.
    if (service === 'melhorenvio' || service === 'google_calendar') {
      fields.redirect_uri = oauthRedirectUri(service);
    }

    const testFn = async (merged) => {
      if (service === 'loggi') {
        await loggiClient.testConnection(merged);
      } else if (service === 'geoapify') {
        await geoClient.testConnection(merged);
      } else if (service === 'google_calendar') {
        await gcAuth.testConnection(merged);
      } else if (service === 'email') {
        await emailClient.testConnection(merged);
      } else if (service === 'pagarme') {
        await pagarmeService.testConnection(merged);
      } else if (service === 'soucannabis_orders') {
        await scOrdersService.testConnection(merged);
      } else if (service === 'utalk') {
        await utalkClient.testConnection(merged);
      } else {
        await meAuth.testConnection(merged);
      }
    };

    const credentials = await credentialsService.putCredentials(service, fields, {
      runTest,
      testFn,
    });
    if (
      service === 'pagarme' &&
      (fields.webhook_user != null || fields.webhook_pass != null)
    ) {
      await pagarmeService.clearWebhookValidation().catch(() => {});
    }
    // E-mail: autenticação SMTP ok → ativa o módulo automaticamente.
    if (service === 'email' && runTest) {
      await upsertModuleFlag(
        'modules.email.enabled',
        true,
        'Módulo email ativado após autenticação SMTP'
      );
    }
    res.json(ok({ service, credentials, persisted: true }));
  } catch (err) {
    next(err);
  }
});

router.post('/:service/activate-production', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    if (service !== 'melhorenvio') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Somente Melhor Envio suporta ativar produção');
    }
    const result = await meAuth.setEnvironment('production', { clearAppCredentials: true });
    const credentials = await credentialsService.listPublic(service);
    const oauth = await meAuth.oauthStatus();
    res.json(
      ok({
        service,
        ...result,
        credentials,
        oauth,
        message:
          'Produção ativada. Informe client_id e client_secret do app de produção e autorize novamente.',
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:service/activate-sandbox', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    if (service !== 'melhorenvio') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Somente Melhor Envio suporta ativar sandbox');
    }
    const result = await meAuth.setEnvironment('sandbox', { clearAppCredentials: true });
    const credentials = await credentialsService.listPublic(service);
    const oauth = await meAuth.oauthStatus();
    res.json(
      ok({
        service,
        ...result,
        credentials,
        oauth,
        message: 'Sandbox ativado. Use as credenciais do app de teste e autorize novamente.',
      })
    );
  } catch (err) {
    next(err);
  }
});

router.delete('/:service/credentials/:fieldKey', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    const credentials = await credentialsService.deleteCredential(service, req.params.fieldKey);
    res.json(ok({ service, credentials }));
  } catch (err) {
    next(err);
  }
});

router.post('/:service/test', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    const creds = await credentialsService.resolveAll(service);
    let extra = {};
    if (service === 'loggi') {
      await loggiClient.testConnection(creds);
    } else if (service === 'geoapify') {
      await geoClient.testConnection(creds);
    } else if (service === 'google_calendar') {
      await gcAuth.testConnection(creds);
    } else if (service === 'email') {
      await emailClient.testConnection(creds);
    } else if (service === 'pagarme') {
      extra = await pagarmeService.testConnection(creds);
    } else if (service === 'soucannabis_orders') {
      extra = await scOrdersService.testConnection(creds);
    } else if (service === 'utalk') {
      extra = await utalkClient.testConnection(creds);
    } else {
      await meAuth.testConnection(creds);
    }
    await credentialsService.markTestResult(service, true);
    // E-mail: revalidação SMTP ok → ativa o módulo automaticamente.
    if (service === 'email') {
      await upsertModuleFlag(
        'modules.email.enabled',
        true,
        'Módulo email ativado após autenticação SMTP'
      );
    }
    res.json(ok({ ok: true, ...extra }));
  } catch (err) {
    await credentialsService.markTestResult(req.params.service, false).catch(() => {});
    next(err);
  }
});

router.post('/:service/test-email', async (req, res, next) => {
  try {
    const service = serviceOrThrow(req.params.service);
    if (service !== 'email') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Somente o serviço email aceita test-email');
    }
    const to = req.body?.to;
    const result = await emailClient.sendTestEmail({ to });
    await credentialsService.markTestResult(service, true);
    res.json(ok(result));
  } catch (err) {
    await credentialsService.markTestResult('email', false).catch(() => {});
    next(err);
  }
});

module.exports = router;
