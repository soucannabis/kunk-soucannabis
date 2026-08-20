'use strict';

const { query } = require('../db/pool');
const itemsRepository = require('../repositories/itemsRepository');
const filesRepository = require('../repositories/filesRepository');
const receptionService = require('./receptionService');
const storeFreight = require('./storeFreightConfig');
const orderStatuses = require('./orderStatusesService');
const { computeExpectedTotal } = require('./orderTotals');
const {
  hasStreetAddress,
  deliveryAddressFromUser,
  pickDisplayTracking,
  isDisplayTrackingCode,
} = require('./orderAddressTracking');
const institutional = require('./institutionalClientsService');
const stockService = require('./stockService');
const { AppError } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');

const FORBIDDEN_CHECKOUT_FIELDS = [
  'coupon_id',
  'no_commission',
  'bvid',
];

function rejectForbidden(payload) {
  for (const key of FORBIDDEN_CHECKOUT_FIELDS) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      throw new AppError(400, 'VALIDATION_ERROR', `Campo não suportado: ${key}`);
    }
  }
}

async function validateAndNormalizeCheckout(payload) {
  rejectForbidden(payload);

  const { isModuleEnabled } = require('./moduleFlags');
  const scOn = await isModuleEnabled('soucannabis_orders');
  if (scOn) {
    payload = { ...payload, delivery_price: 0 };
  }

  const cfg = await storeFreight.getStoreFreightConfig();
  const breakdown = computeExpectedTotal({
    items: payload.items || [],
    delivery_price: payload.delivery_price,
    apply_to_total: cfg.apply_to_total,
    discount: payload.discount,
    donation: payload.donation,
    custom_payment: payload.custom_payment,
  });

  const clientTotal = payload.total;
  if (clientTotal !== undefined && clientTotal !== null) {
    if (Math.abs(Number(clientTotal) - breakdown.expected_total) > 0.01) {
      throw new AppError(
        400,
        'TOTAL_MISMATCH',
        `Total informado (${Number(clientTotal)}) diverge do calculado (${breakdown.expected_total})`,
        {
          client_total: Number(clientTotal),
          expected_total: breakdown.expected_total,
          breakdown,
        }
      );
    }
  }

  const {
    coupon_id,
    no_commission,
    bvid,
    email,
    associate_email,
    associate_code,
    name_associate,
    info,
    kunk_user,
    ...rest
  } = payload;

  const associateName = rest.associate_name || name_associate || rest.associate_name || null;
  const receiverName =
    rest.receiver_name != null && String(rest.receiver_name).trim() !== ''
      ? String(rest.receiver_name).trim()
      : associateName;

  return {
    body: {
      ...rest,
      associate_name: associateName,
      receiver_name: receiverName,
      details: info !== undefined ? info : rest.details,
      total: breakdown.expected_total,
      discount: breakdown.discount,
      donation: breakdown.donation,
      delivery_price: Number(payload.delivery_price) || 0,
      freight_carrier: payload.freight_carrier || payload.freight_option?.provider || null,
      freight_option: payload.freight_option || null,
    },
    triage: {
      email: email || associate_email,
      associate_code: associate_code || payload.user_code,
    },
    breakdown,
  };
}

async function loadUserForOrder(payload) {
  if (payload?.user) {
    const byId = await query(
      `SELECT id, user_code, associate_name, associate_last_name, associate_cpf, mobile_number,
              email_account, delivery_address, street, street_number, complement,
              neighborhood, city, state, cep
       FROM users WHERE id = $1 LIMIT 1`,
      [payload.user]
    );
    if (byId.rows[0]) return byId.rows[0];
  }
  if (payload?.user_code) {
    const byCode = await query(
      `SELECT id, user_code, associate_name, associate_last_name, associate_cpf, mobile_number,
              email_account, delivery_address, street, street_number, complement,
              neighborhood, city, state, cep
       FROM users WHERE user_code = $1 LIMIT 1`,
      [payload.user_code]
    );
    if (byCode.rows[0]) return byCode.rows[0];
  }
  return null;
}

async function resolveOrderAddress(body) {
  if (hasStreetAddress(body.address)) return body.address;
  const client = await institutional.loadClientForOrder(body);
  if (client) return institutional.deliveryAddressFromClient(client);
  const user = await loadUserForOrder(body);
  return deliveryAddressFromUser(user);
}

function associateDisplayName(user) {
  if (!user) return null;
  return `${user.associate_name || ''} ${user.associate_last_name || ''}`.trim() || null;
}

function assertOrderOwnerXor(body) {
  const hasUser = Boolean(body.user || body.user_code);
  const hasIc = Boolean(body.institutional_client_id || body.institutional_client_code || body.client_code);
  if (hasUser && hasIc) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pedido deve vincular associado OU cliente institucional, não ambos'
    );
  }
  if (!hasUser && !hasIc) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pedido sem associado nem cliente institucional'
    );
  }
}

async function createOrder(payload, actor) {
  const { body, triage } = await validateAndNormalizeCheckout(payload || {});
  assertOrderOwnerXor(body);

  const address = await resolveOrderAddress(body);
  if (!hasStreetAddress(address)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pedido sem endereço. Preencha o endereço de entrega ou informe address no pedido.'
    );
  }

  let associateName = body.associate_name;
  let receiverName = body.receiver_name;
  const client = await institutional.loadClientForOrder(body);
  const user = client ? null : await loadUserForOrder(body);

  if (client) {
    associateName = institutional.displayName(client) || associateName || null;
    receiverName = institutional.receiverName(client) || receiverName || associateName;
    body.institutional_client_id = client.id;
    body.institutional_client_code = client.client_code;
    body.user = null;
    body.user_code = null;
  } else {
    const display = associateDisplayName(user);
    // Prefere nome completo do cadastro (associate_name + associate_last_name).
    if (display) {
      const payloadName = String(associateName || '').trim();
      associateName = display;
      if (!receiverName || String(receiverName).trim() === payloadName) {
        receiverName = display;
      }
    } else {
      associateName = associateName || null;
      receiverName = receiverName || associateName;
    }
    body.institutional_client_id = null;
    body.institutional_client_code = null;
  }

  delete body.client_code;

  const { isModuleEnabled } = require('./moduleFlags');
  const scOn = await isModuleEnabled('soucannabis_orders');
  if (!scOn) {
    const stockSnap = await stockService.snapshotItemsStock(body.items || []);
    body.items = stockSnap.items;
  }

  const statuses = await orderStatuses.getOrderStatuses();
  const awaiting = orderStatuses.getAwaitingValue(statuses);
  // Pedido local nunca nasce pago — sync SC só após pagamento.
  if (body.status == null || body.status === orderStatuses.getPaidValue(statuses)) {
    body.status = awaiting;
  }

  const orderBody = {
    ...body,
    address,
    associate_name: associateName,
    receiver_name: receiverName || associateName,
    order_code: body.order_code || uuidv4(),
    date_created: new Date().toISOString(),
    created_by_user_code:
      body.created_by_user_code || actor?.internal_code || actor?.user_code || null,
  };
  const order = await itemsRepository.createItem('orders', orderBody);
  try {
    if (!client) {
      await receptionService.completeOpenByAssociate({
        email: triage.email,
        associate_code: triage.associate_code,
        completion_reason: 'Pedido',
        actor,
      });
    }
  } catch {
    /* non-blocking */
  }
  return order;
}

async function updateOrder(id, payload, actor) {
  const existing = await itemsRepository.getItem('orders', id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  // Edição pelo carrinho: se já havia baixa de estoque (pagamento concluído), estorna antes de alterar itens/status.
  if (existing.stock_debited_at) {
    await stockService.reverseSaleForOrder(id);
  }

  const merged = { ...existing, ...payload, id: existing.id };
  const { body } = await validateAndNormalizeCheckout(merged);
  // Pedido já existente: address do payload (ou o já salvo) tem prioridade sobre o do usuário.
  if (hasStreetAddress(payload?.address)) {
    body.address = payload.address;
  } else if (hasStreetAddress(existing.address)) {
    body.address = existing.address;
  } else {
    body.address = await resolveOrderAddress({ ...existing, ...body });
  }
  if (!body.receiver_name) {
    body.receiver_name = existing.receiver_name || body.associate_name || existing.associate_name;
  }

  const { isModuleEnabled } = require('./moduleFlags');
  const scOn = await isModuleEnabled('soucannabis_orders');
  if (!scOn) {
    const stockSnap = await stockService.snapshotItemsStock(body.items || []);
    body.items = stockSnap.items;
  }

  const updated = await itemsRepository.updateItem('orders', id, {
    ...body,
    stock_debited_at: null,
    date_updated: new Date().toISOString(),
  });
  try {
    const syncOrders = require('./soucannabis_orders/syncOrders');
    // Espelhar só o delta do request — o row completo zera campos null/vazios no legado.
    const syncPatch = buildSoucannabisMirrorPatch(payload, updated);
    if (Object.keys(syncPatch).length) {
      await syncOrders.mirrorIfMapped(id, syncPatch);
    }
  } catch {
    /* non-blocking */
  }
  return updated;
}

/** Campos do PATCH local que podem ir para a SC (evita mandar o pedido inteiro). */
function buildSoucannabisMirrorPatch(payload = {}, updated = {}) {
  const syncKeys = [
    'status',
    'items',
    'total',
    'associate_name',
    'receiver_name',
    'user_code',
    'details',
    'order_notes',
    'delivery_price',
    'discount',
    'donation',
    'tags',
    'tracking_code',
    'tracking_code_date',
    'payment_date',
    'payment_method',
    'address',
    'prescriber',
    'prescriber_code',
    'external_payment_info',
    'external_delivery_type',
  ];
  const syncPatch = {};
  for (const key of syncKeys) {
    if (payload[key] === undefined) continue;
    syncPatch[key] = updated[key] !== undefined ? updated[key] : payload[key];
  }
  if (payload.info !== undefined && syncPatch.details === undefined) {
    syncPatch.details = updated.details !== undefined ? updated.details : payload.info;
  }
  return syncPatch;
}

/** Patch leve do modal de detalhes (sem revalidar total do checkout). */
async function updateOrderDetails(id, payload = {}) {
  const existing = await itemsRepository.getItem('orders', id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  const patch = { date_updated: new Date().toISOString() };
  if (payload.receiver_name !== undefined) {
    patch.receiver_name = String(payload.receiver_name || '').trim() || existing.associate_name;
  }
  if (payload.details !== undefined || payload.info !== undefined) {
    patch.details = payload.details !== undefined ? payload.details : payload.info;
  }
  if (payload.address !== undefined) {
    if (payload.address && !hasStreetAddress(payload.address)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Endereço do pedido incompleto (rua obrigatória)');
    }
    patch.address = payload.address;
  }
  if (payload.address_validation !== undefined) {
    patch.address_validation = payload.address_validation;
  }

  const updated = await itemsRepository.updateItem('orders', id, patch);
  try {
    const syncOrders = require('./soucannabis_orders/syncOrders');
    const syncPatch = buildSoucannabisMirrorPatch(patch, updated);
    if (Object.keys(syncPatch).length) {
      await syncOrders.mirrorIfMapped(id, syncPatch);
    }
  } catch {
    /* non-blocking */
  }
  return updated;
}

async function getOrderDetails(id) {
  const order = await itemsRepository.getItem('orders', id);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  const client = await institutional.loadClientForOrder(order);
  const user = client ? null : await loadUserForOrder(order);
  const files = await listOrderFiles(id);
  return {
    ...order,
    display_tracking_code: pickDisplayTracking(order.tracking_code),
    associate: user
      ? {
          id: user.id,
          user_code: user.user_code,
          name: associateDisplayName(user),
          phone: user.mobile_number || null,
          cpf: user.associate_cpf || null,
          email: user.email_account || null,
        }
      : null,
    institutional_client: client
      ? {
          id: client.id,
          client_code: client.client_code,
          is_company: Boolean(client.is_company),
          name: institutional.displayName(client),
          receiver_name: institutional.receiverName(client),
          document: institutional.shippingDocument(client) || null,
          phone: institutional.shippingPhone(client) || null,
          email: institutional.shippingEmail(client) || null,
        }
      : null,
    files,
  };
}

async function listOrderFiles(orderId) {
  const result = await query(
    `SELECT f.id, f.filename, f.mime_type, f.storage_path, f.created_at, of.id AS link_id
     FROM orders_files of
     JOIN files f ON f.id = of.file_id
     WHERE of.order_id = $1
     ORDER BY f.created_at DESC NULLS LAST, f.id DESC`,
    [orderId]
  );
  return result.rows.map((row) => ({
    ...row,
    url: `/api/v1/files/${row.id}/download`,
  }));
}

/**
 * Anexa comprovante ao pedido. Se status = aguardando pagamento, marca como pago.
 */
async function attachOrderFile(orderId, fileId, { confirmPayment = true } = {}) {
  const order = await itemsRepository.getItem('orders', orderId);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  await filesRepository.attachFile(fileId, 'orders', orderId);
  const file = await filesRepository.getFile(fileId);

  let updated = order;
  if (confirmPayment) {
    const statuses = await orderStatuses.getOrderStatuses();
    const awaiting = orderStatuses.getAwaitingValue(statuses);
    const paid = orderStatuses.getPaidValue(statuses);
    if (order.status === awaiting) {
      updated = await updateStatus(orderId, paid, {
        source: 'comprovante',
        skipPaymentLock: true,
        external_payment_info: {
          provider: 'manual',
          method: 'comprovante',
          paid_at: new Date().toISOString(),
          local_order_code: String(order.order_code || order.id),
          file_id: fileId,
        },
      });
    }
  }

  return {
    file,
    order: updated,
    payment_confirmed: updated.status !== order.status,
  };
}

async function getOrderTracking(id) {
  const order = await itemsRepository.getItem('orders', id);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  const carrier = String(
    order.external_delivery_type || order.freight_carrier || order.freight_option?.provider || ''
  ).toLowerCase();
  const now = new Date().toISOString();

  let trackingAvail = { loggi: true, melhorenvio: true };
  try {
    const freightService = require('./freightService');
    trackingAvail = await freightService.getTrackingAvailability();
  } catch {
    /* keep permissive fallback */
  }

  if (carrier === 'loggi') {
    if (!trackingAvail.loggi) {
      return {
        provider: 'loggi',
        tracking_code: pickDisplayTracking(order.tracking_code),
        carrier_order_code: order.carrier_order_code,
        package: null,
        message:
          'Consulta Loggi desligada. Ative o módulo Loggi e a opção Tracking no Admin.',
      };
    }
    const loggiLabel = require('./loggi/label');
    const code =
      pickDisplayTracking(order.tracking_code) ||
      order.tracking_code ||
      order.carrier_order_code;
    if (!code) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Pedido sem código Loggi para rastrear');
    }
    try {
      const data = await loggiLabel.getPackages({
        trackingCode: pickDisplayTracking(order.tracking_code) || order.tracking_code,
        loggiKey: order.carrier_order_code,
      });
      const pkg = data.package || data.packages?.[0] || data;
      const tracking =
        pickDisplayTracking(pkg?.trackingCode, data?.trackingCode, order.tracking_code) || null;
      if (tracking && tracking !== order.tracking_code) {
        await itemsRepository.updateItem('orders', id, {
          tracking_code: tracking,
          last_tracking_date: now,
          date_updated: now,
        });
      } else {
        await itemsRepository.updateItem('orders', id, { last_tracking_date: now }).catch(() => {});
      }
      return {
        provider: 'loggi',
        tracking_code: tracking || pickDisplayTracking(order.tracking_code) || code,
        carrier_order_code: order.carrier_order_code,
        package: pkg,
        trackingPartial: Boolean(data.trackingPartial),
      };
    } catch (err) {
      const notFound =
        err?.status === 404 ||
        err?.code === 'LOGGI_NOT_FOUND' ||
        /não encontrado|not found/i.test(err?.message || '');
      if (notFound) {
        return {
          provider: 'loggi',
          tracking_code: pickDisplayTracking(order.tracking_code) || code,
          carrier_order_code: order.carrier_order_code,
          package: null,
          pending: true,
          message:
            'Código de rastreio gerado, mas a Loggi ainda não disponibilizou o histórico. Tente novamente em alguns minutos.',
        };
      }
      throw err;
    }
  }

  if (carrier === 'melhorenvio') {
    if (!trackingAvail.melhorenvio) {
      const code = pickDisplayTracking(order.tracking_code);
      return {
        provider: 'melhorenvio',
        tracking_code: code,
        carrier_order_code: order.carrier_order_code,
        shipment: null,
        tracking_url: code ? `https://www.melhorrastreio.com.br/rastreio/${code}` : null,
        message:
          'Consulta Melhor Envio desligada. Ative o módulo e a opção Tracking no Admin.',
      };
    }
    const meLabel = require('./melhorenvio/label');
    const shipmentId = order.carrier_order_code || pickDisplayTracking(order.tracking_code);
    if (!shipmentId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Pedido sem id/código Melhor Envio para rastrear');
    }
    const data = await meLabel.getShipmentDetails(shipmentId);
    const tracking = pickDisplayTracking(
      data?.tracking,
      data?.self_tracking,
      data?.[shipmentId]?.tracking,
      order.tracking_code
    );
    const patch = { last_tracking_date: now, date_updated: now };
    if (tracking && tracking !== order.tracking_code) {
      patch.tracking_code = tracking;
      patch.tracking_code_date = now;
    }
    await itemsRepository.updateItem('orders', id, patch);
    const code = tracking || pickDisplayTracking(order.tracking_code);
    return {
      provider: 'melhorenvio',
      tracking_code: code,
      carrier_order_code: order.carrier_order_code,
      shipment: data,
      tracking_url:
        data?.tracking_url || (code ? `https://www.melhorrastreio.com.br/rastreio/${code}` : null),
    };
  }

  return {
    provider: carrier || null,
    tracking_code: pickDisplayTracking(order.tracking_code),
    carrier_order_code: order.carrier_order_code,
    shipment: null,
    package: null,
    message: carrier
      ? 'Transportadora sem integração de rastreio neste pedido'
      : 'Sem transportadora (external_delivery_type / freight_carrier) para consultar API',
  };
}

function normalizeEndDate(endDate) {
  if (!endDate) return endDate;
  const s = String(endDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59:59`;
  return s;
}

function parseTagsParam(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function resolveDateColumn(dateField) {
  return dateField === 'payment_date' ? 'payment_date' : 'date_created';
}

function buildListWhere(queryParams = {}) {
  const params = [];
  const parts = [];

  if (queryParams.status) {
    params.push(String(queryParams.status));
    parts.push(`status = $${params.length}`);
  }

  const dateCol = resolveDateColumn(queryParams.date_field);
  if (queryParams.date_from) {
    params.push(String(queryParams.date_from));
    parts.push(`${dateCol} >= $${params.length}::timestamptz`);
  }
  if (queryParams.date_to) {
    params.push(normalizeEndDate(queryParams.date_to));
    parts.push(`${dateCol} <= $${params.length}::timestamptz`);
  }

  if (queryParams.created_by) {
    params.push(String(queryParams.created_by));
    parts.push(`created_by_user_code = $${params.length}`);
  }

  if (queryParams.q) {
    params.push(`%${String(queryParams.q).trim()}%`);
    const i = params.length;
    parts.push(
      `(associate_name ILIKE $${i} OR order_code::text ILIKE $${i} OR tracking_code ILIKE $${i} OR CAST(id AS text) ILIKE $${i} OR COALESCE(address::text, '') ILIKE $${i})`
    );
  }

  const tags = parseTagsParam(queryParams.tags);
  for (const tag of tags) {
    params.push(tag);
    const i = params.length;
    parts.push(`EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(COALESCE(tags, '[]'::jsonb)) = 'array'
          THEN COALESCE(tags, '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE (
        (jsonb_typeof(elem) = 'string' AND TRIM(elem #>> '{}') = $${i})
        OR (jsonb_typeof(elem) = 'object' AND (
          TRIM(COALESCE(elem->>'tag', '')) = $${i}
          OR TRIM(COALESCE(elem->>'name', '')) = $${i}
        ))
      )
    )`);
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  return { where, params };
}

async function listOrders(queryParams = {}) {
  const lim = Math.min(Math.max(Number(queryParams.limit) || 50, 1), 200);
  const off = Math.max(Number(queryParams.offset) || 0, 0);
  const { where, params } = buildListWhere(queryParams);
  const dateCol = resolveDateColumn(queryParams.date_field);

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM orders ${where}`, params);
  const listParams = [...params, lim, off];
  const result = await query(
    `SELECT * FROM orders ${where}
     ORDER BY ${dateCol} DESC NULLS LAST, id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const data = (result.rows || []).map((row) => ({
    ...row,
    tags: normalizeTags(row.tags),
  }));

  return {
    data,
    meta: {
      filter_count: countResult.rows[0].total,
      total_count: countResult.rows[0].total,
      limit: lim,
      offset: off,
    },
  };
}

async function facets(queryParams = {}) {
  const { where, params } = buildListWhere({
    ...queryParams,
    status: undefined,
    tags: undefined,
  });

  const statusResult = await query(
    `SELECT COALESCE(NULLIF(TRIM(status), ''), 'Sem status') AS status, COUNT(*)::int AS count
     FROM orders ${where}
     GROUP BY 1
     ORDER BY count DESC`,
    params
  );

  const tagResult = await query(
    `SELECT tag, COUNT(*)::int AS count
     FROM (
       SELECT CASE
         WHEN jsonb_typeof(elem) = 'string' THEN TRIM(elem #>> '{}')
         WHEN jsonb_typeof(elem) = 'object' THEN TRIM(COALESCE(elem->>'tag', elem->>'name', ''))
         ELSE NULL
       END AS tag
       FROM orders
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(COALESCE(tags, '[]'::jsonb)) = 'array' THEN COALESCE(tags, '[]'::jsonb)
           ELSE '[]'::jsonb
         END
       ) AS elem
       ${where}
     ) t
     WHERE tag IS NOT NULL AND tag <> ''
     GROUP BY tag
     ORDER BY count DESC
     LIMIT 100`,
    params
  );

  const statusCounts = {};
  for (const row of statusResult.rows) {
    statusCounts[row.status] = row.count;
  }
  const tagCounts = {};
  for (const row of tagResult.rows) {
    tagCounts[row.tag] = row.count;
  }

  return { statusCounts, tagCounts };
}

async function statusConfig() {
  const statuses = await orderStatuses.getOrderStatuses();
  return {
    statuses,
    awaiting: orderStatuses.getAwaitingValue(statuses),
    paid: orderStatuses.getPaidValue(statuses),
  };
}

async function updateStatus(id, status, options = {}) {
  if (!status) throw new AppError(400, 'VALIDATION_ERROR', 'status é obrigatório');
  const statuses = await orderStatuses.getOrderStatuses();
  if (!orderStatuses.isAllowedStatus(status, statuses)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Status não permitido: ${status}`);
  }

  const awaiting = orderStatuses.getAwaitingValue(statuses);
  const paid = orderStatuses.getPaidValue(statuses);
  const skipPaymentLock = options.skipPaymentLock === true;
  const { isModuleEnabled } = require('./moduleFlags');
  const scOn = await isModuleEnabled('soucannabis_orders');
  const pagarmeOrders = require('./pagarme/orders');

  const updated = await stockService.withTransaction(async (client) => {
    const existingRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id]);
    const existing = existingRes.rows[0];
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

    if (status === paid && existing.status !== paid && !skipPaymentLock) {
      const total = Number(existing.total || 0);
      if (total > 0 && (await pagarmeOrders.isSplitMode())) {
        throw new AppError(
          403,
          'PAYMENT_LOCK',
          'Com Pedidos SouCannabis ativo, confirme o pagamento via Pagar.me, comprovante ou total zero'
        );
      }
    }

    // Com SC: sem baixa/estorno de estoque local.
    if (!scOn) {
      if (status === paid) {
        await stockService.applySaleForOrder(id, client);
      } else if (status === awaiting) {
        await stockService.reverseSaleForOrder(id, client);
      } else if (existing.status === paid && !existing.stock_debited_at) {
        await stockService.applySaleForOrder(id, client);
      }
    }

    const now = new Date().toISOString();
    const sets = ['status = $1', 'date_updated = $2'];
    const params = [status, now];

    if (status === paid && existing.status !== paid) {
      sets.push(`payment_date = $${params.length + 1}`);
      params.push(now);
      // Lote vigente do produto nos itens (legado sem SCP/FIFO).
      const stamped = await stockService.stampItemsBatch(client, existing.items);
      sets.push(`items = $${params.length + 1}::jsonb`);
      params.push(JSON.stringify(stamped.items));
    } else if (status === awaiting && existing.status === paid) {
      sets.push(`payment_date = $${params.length + 1}`);
      params.push(null);
    }

    if (options.external_payment_info != null) {
      sets.push(`external_payment_info = $${params.length + 1}::jsonb`);
      params.push(JSON.stringify(options.external_payment_info));
    }

    params.push(id);
    const result = await client.query(
      `UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return { row: result.rows[0], previous: existing };
  });

  const row = updated.row;
  const previous = updated.previous;
  try {
    const syncOrders = require('./soucannabis_orders/syncOrders');
    if (!syncOrders.isSkipped(id)) {
      if (status === paid && previous.status !== paid) {
        await syncOrders.createIfNeeded(id, {
          external_payment_info: options.external_payment_info || row.external_payment_info,
        });
      } else if (status === awaiting && previous.status === paid) {
        await syncOrders.mirrorIfMapped(id, {
          status: awaiting,
          payment_date: null,
        });
      } else if (previous.soucannabis_order_id || row.soucannabis_order_id) {
        await syncOrders.mirrorIfMapped(id, { status });
      }
    }
  } catch {
    /* sync error already persisted on order */
  }
  try {
    const { emitWebhookSafe } = require('./webhooks/emit');
    const { stripSensitive } = require('../schema/collections');
    const { diffChangedFields, hasMeaningfulChanges } = require('./webhooks/diff');
    const after = stripSensitive('orders', row);
    const before = stripSensitive('orders', previous);
    const changed = diffChangedFields(before, after, { alwaysInclude: ['id'] });
    if (hasMeaningfulChanges(changed, ['id'])) {
      emitWebhookSafe({
        table: 'orders',
        action: 'update',
        recordId: row.id,
        data: changed,
      });
    }
  } catch {
    /* fail-soft */
  }
  return row;
}

async function updateProduction(id, payload) {
  return itemsRepository.updateItem('orders', id, {
    production_owner: payload.production_owner,
    status: payload.status,
  });
}

async function registerPayment(id, payload) {
  return itemsRepository.updateItem('orders', id, {
    payment_link: payload.payment_link,
    payment_code: payload.payment_code,
    payment_method: payload.payment_method,
    payment_date: payload.payment_date || new Date().toISOString(),
  });
}

async function stats() {
  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status ORDER BY count DESC`
  );
  return { by_status: byStatus.rows };
}

async function listByUser(userCode) {
  const result = await query(
    `SELECT * FROM orders WHERE user_code = $1 ORDER BY date_created DESC NULLS LAST LIMIT 100`,
    [userCode]
  );
  return result.rows;
}

async function deleteOrder(id) {
  // Pedido já sincronizado: DELETE remoto na SC antes do local (falha remota bloqueia).
  const syncOrders = require('./soucannabis_orders/syncOrders');
  await syncOrders.deleteIfMapped(id);

  const { isModuleEnabled } = require('./moduleFlags');
  const scOn = await isModuleEnabled('soucannabis_orders');

  const deleted = await stockService.withTransaction(async (client) => {
    const existingRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id]);
    const existing = existingRes.rows[0];
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

    // Estorna baixa local antes de remover o histórico (sem módulo SC).
    if (!scOn && existing.stock_debited_at) {
      await stockService.reverseSaleForOrder(id, client);
    }

    await client.query(`DELETE FROM product_stock_movements WHERE order_id = $1`, [id]);
    await client.query(`DELETE FROM orders_files WHERE order_id = $1`, [id]);

    const result = await client.query(`DELETE FROM orders WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');
    return { id: result.rows[0].id, before: existing };
  });

  try {
    const { emitWebhookSafe } = require('./webhooks/emit');
    const { stripSensitive } = require('../schema/collections');
    emitWebhookSafe({
      table: 'orders',
      action: 'delete',
      recordId: deleted.id,
      data: stripSensitive('orders', deleted.before) || { id: deleted.id },
    });
  } catch {
    /* fail-soft */
  }

  return { id: deleted.id };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (typeof t === 'string' ? t : t?.tag || t?.name || ''))
    .map((t) => String(t).trim())
    .filter(Boolean);
}

async function bulkAction(payload = {}) {
  const ids = Array.isArray(payload.ids) ? payload.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new AppError(400, 'VALIDATION_ERROR', 'ids é obrigatório');
  const action = String(payload.action || '');

  if (action === 'status') {
    const results = [];
    for (const id of ids) {
      try {
        const data = await updateStatus(id, payload.status);
        results.push({ order_id: id, ok: true, data });
      } catch (err) {
        results.push({ order_id: id, ok: false, error: err.message || String(err) });
      }
    }
    return { results };
  }

  if (action === 'tags_add' || action === 'tags_remove') {
    const addTags = normalizeTags(payload.tags);
    const results = [];
    for (const id of ids) {
      try {
        const order = await itemsRepository.getItem('orders', id);
        let tags = normalizeTags(order.tags);
        if (action === 'tags_add') {
          for (const t of addTags) {
            if (!tags.includes(t)) tags.push(t);
          }
        } else {
          tags = tags.filter((t) => !addTags.includes(t));
        }
        const data = await itemsRepository.updateItem('orders', id, { tags });
        results.push({ order_id: id, ok: true, data });
      } catch (err) {
        results.push({ order_id: id, ok: false, error: err.message || String(err) });
      }
    }
    return { results };
  }

  if (action === 'label_create' || action === 'label_cancel') {
    const provider = String(payload.provider || '').toLowerCase();
    if (!['loggi', 'melhorenvio'].includes(provider)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'provider deve ser loggi ou melhorenvio');
    }
    const loggiLabel = require('./loggi/label');
    const meLabel = require('./melhorenvio/label');
    const results = [];
    for (const id of ids) {
      try {
        const order = await itemsRepository.getItem('orders', id);
        let data;
        if (action === 'label_create') {
          const body = {
            order_id: id,
            order_code: order.order_code,
            address: order.address,
            name_associate: order.receiver_name || order.associate_name,
            freight_option: order.freight_option,
            user: { name: order.receiver_name || order.associate_name },
          };
          data =
            provider === 'loggi'
              ? await loggiLabel.createLabel(body)
              : await meLabel.createLabel(body);
        } else {
          data =
            provider === 'loggi'
              ? await loggiLabel.cancelPackage({
                  orderId: id,
                  tracking_code: order.tracking_code || null,
                  loggi_key: order.carrier_order_code || null,
                  order,
                })
              : await meLabel.cancelLabel({ orderId: id, order });
        }
        results.push({ order_id: id, ok: true, data });
      } catch (err) {
        results.push({ order_id: id, ok: false, error: err.message || String(err) });
      }
    }
    return { results };
  }

  throw new AppError(
    400,
    'VALIDATION_ERROR',
    'action inválida (status|tags_add|tags_remove|label_create|label_cancel)'
  );
}

module.exports = {
  createOrder,
  updateOrder,
  updateOrderDetails,
  getOrderDetails,
  listOrderFiles,
  attachOrderFile,
  getOrderTracking,
  updateStatus,
  updateProduction,
  registerPayment,
  stats,
  listByUser,
  listOrders,
  facets,
  statusConfig,
  deleteOrder,
  bulkAction,
  validateAndNormalizeCheckout,
  isDisplayTrackingCode,
  pickDisplayTracking,
};
