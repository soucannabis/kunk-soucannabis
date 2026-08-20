'use strict';

const orderStatuses = require('../orderStatusesService');
const { associateFullName } = require('../pagarme/orders');

function mapItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    cod: it.cod || it.code || it.product_code || null,
    name: it.name || it.product_name || 'Item',
    quantity: Number(it.quantity || it.qty || 1),
    amount: Number(it.amount || it.price || it.unit_price || 0),
  }));
}

function mapAddress(address) {
  if (!address) return undefined;
  let a = address;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      return undefined;
    }
  }
  return {
    street: a.street || a.line_1 || '',
    number: a.number || a.street_number || '',
    complement: a.complement || a.complementary || '',
    neighborhood: a.neighborhood || '',
    city: a.city || '',
    state: a.state || '',
    cep: a.cep || a.zip_code || '',
  };
}

function tagsAsStrings(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean);
}

async function toRemoteCreatePayload(order, { userRow = null, externalPaymentInfo = null } = {}) {
  const statuses = await orderStatuses.getOrderStatuses();
  const awaitingApproval = orderStatuses.getAwaitingApprovalValue(statuses);
  const externalId = String(order.order_code || order.id);
  const fullName =
    (userRow && associateFullName(userRow)) ||
    order.associate_name ||
    order.receiver_name ||
    'Associado';

  const payload = {
    external_id: externalId,
    items: mapItems(order.items),
    total: Number(order.total || 0),
    status: awaitingApproval,
    // Não enviar `user` com nome — no Kunk legado `Orders.user` é FK integer.
    // A SC resolve o associado via `user_code` (outbound users desta instalação).
    user_code: order.user_code || null,
    name_associate: fullName,
    email: userRow?.email_account || null,
    address: mapAddress(order.address),
    delivery_price: Number(order.delivery_price || 0),
    discount: order.discount != null ? Number(order.discount) : undefined,
    donation: order.donation != null ? Number(order.donation) : undefined,
    info: order.details || order.order_notes || undefined,
    tags: tagsAsStrings(order.tags),
    payment_date: order.payment_date || new Date().toISOString(),
    payment_form: order.payment_method || undefined,
    prescriber: order.prescriber || undefined,
    prescriber_code: order.prescriber_code || undefined,
  };

  if (externalPaymentInfo) {
    payload.external_payment_info = externalPaymentInfo;
  } else if (order.external_payment_info) {
    payload.external_payment_info = order.external_payment_info;
  }

  return payload;
}

/** Campos que o legado aceita limpar com null (demais nulls são omitidos no PATCH). */
const PATCH_NULLABLE = new Set(['payment_date', 'details', 'order_notes']);

function toRemotePatchPayload(patch = {}) {
  const out = {};
  const map = {
    status: 'status',
    items: 'items',
    total: 'total',
    user_code: 'user_code',
    details: 'info',
    order_notes: 'info',
    delivery_price: 'delivery_price',
    discount: 'discount',
    donation: 'donation',
    tags: 'tags',
    tracking_code: 'tracking_code',
    tracking_code_date: 'tracking_code_date',
    payment_date: 'payment_date',
    payment_method: 'payment_form',
    address: 'address',
    prescriber: 'prescriber',
    prescriber_code: 'prescriber_code',
    external_payment_info: 'external_payment_info',
    external_delivery_type: 'external_delivery_type',
  };
  for (const [localKey, remoteKey] of Object.entries(map)) {
    if (patch[localKey] === undefined) continue;
    if (patch[localKey] === null && !PATCH_NULLABLE.has(localKey)) continue;
    if (localKey === 'items') out[remoteKey] = mapItems(patch[localKey]);
    else if (localKey === 'address') out[remoteKey] = mapAddress(patch[localKey]);
    else if (localKey === 'tags') out[remoteKey] = tagsAsStrings(patch[localKey]);
    else out[remoteKey] = patch[localKey];
  }
  if (patch.associate_name != null && patch.associate_name !== '') {
    out.name_associate = String(patch.associate_name);
  } else if (patch.receiver_name != null && patch.receiver_name !== '') {
    out.name_associate = String(patch.receiver_name);
  }
  return out;
}

module.exports = {
  mapItems,
  mapAddress,
  toRemoteCreatePayload,
  toRemotePatchPayload,
};
