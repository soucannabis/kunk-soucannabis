'use strict';

const { meRequest } = require('./auth');
const storeFreight = require('../storeFreightConfig');
const itemsRepository = require('../../repositories/itemsRepository');
const { AppError } = require('../../utils/response');
const { pickDisplayTracking } = require('../orderAddressTracking');
const { loadRecipientContact, onlyDigits } = require('../recipientContact');

/** CPF válido (dígitos verificadores). Demo/seed costuma ter CPF inválido. */
function isValidCpf(raw) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/**
 * Fluxo ME: cart → checkout → generate.
 * Grava carrier_order_code (id ME) e tracking_code quando disponível.
 */
async function createLabel({ user, address, name_associate, order_id, order_code, freight_option }) {
  const flags = await storeFreight.getModuleFreightFlags();
  if (!flags.melhorenvio.enabled || !flags.melhorenvio.use_for_label) {
    throw new AppError(403, 'LABEL_NOT_ALLOWED', 'Melhor Envio não está habilitado para etiqueta');
  }

  const cfg = await storeFreight.getStoreFreightConfig();
  storeFreight.assertShipFrom(cfg.ship_from);
  storeFreight.assertContentDeclaration(cfg.content_declaration);
  const pkgSource = cfg.label_package || cfg.package;
  storeFreight.assertPackage(pkgSource);
  const pkg = storeFreight.normalizePackage(pkgSource);

  const dce = {
    description: String(cfg.content_declaration.description || '').trim(),
    total_value: Number(cfg.content_declaration.total_value ?? cfg.content_declaration.totalValue),
  };

  const serviceId = freight_option?.service_id ?? freight_option?.serviceId;
  if (!serviceId) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pedido sem serviço de frete Melhor Envio (freight_option.service_id). Calcule o frete no carrinho e salve o pedido de novo.'
    );
  }

  let order = null;
  if (order_id) {
    order = await itemsRepository.getItem('orders', order_id);
  }

  const contact = await loadRecipientContact(order);
  const to = address || order?.address || {};
  const toPhone = onlyDigits(to.phone || contact.phone || user?.mobile_number || user?.phone);
  if (!toPhone || toPhone.length < 10) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Telefone do destinatário é obrigatório para gerar etiqueta Melhor Envio. Atualize o celular do associado ou cliente institucional.'
    );
  }
  const toDocument = onlyDigits(to.document || to.cpf || contact.document);
  if (!isValidCpf(toDocument) && toDocument.length !== 14) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'CPF/CNPJ do destinatário inválido ou ausente. Atualize o documento do associado ou cliente institucional.'
    );
  }

  const from = cfg.ship_from;
  const fromDocument = onlyDigits(from.document || from.cnpj || from.cpf);
  if (!isValidCpf(fromDocument) && fromDocument.length !== 14) {
    throw new AppError(
      400,
      'CONFIG_INCOMPLETE',
      'CPF/CNPJ do remetente inválido ou ausente. Ajuste em Serviços externos → Dados de envio.'
    );
  }
  // Melhor Envio rejeita CPF idêntico em from/to
  if (fromDocument === toDocument && toDocument.length === 11) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'CPF do remetente e do destinatário são iguais. Ajuste o documento em Dados de envio ou no cadastro do destinatário.'
    );
  }

  const fromCep = onlyDigits(from.cep);
  const toCep = onlyDigits(to.cep);
  if (fromCep.length !== 8) {
    throw new AppError(
      400,
      'CONFIG_INCOMPLETE',
      'CEP do remetente inválido. Ajuste em Serviços externos → Dados de envio.'
    );
  }
  if (toCep.length !== 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CEP do destinatário inválido no pedido');
  }

  const cartBody = {
    service: Number(serviceId) || serviceId,
    from: {
      name: from.name || from.company_name || 'Remetente',
      phone: onlyDigits(from.phone) || '11999999999',
      email: from.email || 'contato@associacao.local',
      document: fromDocument,
      company_document: onlyDigits(from.company_document || from.cnpj) || undefined,
      address: from.street,
      number: String(from.number || ''),
      complement: from.complement || '',
      district: from.neighborhood || '',
      city: from.city,
      country_id: 'BR',
      postal_code: fromCep,
      state_abbr: from.state,
    },
    to: {
      name:
        name_associate ||
        order?.receiver_name ||
        contact.name ||
        user?.name ||
        order?.associate_name ||
        'Destinatário',
      phone: toPhone,
      email: to.email || contact.email || undefined,
      document: toDocument,
      address: to.street,
      number: String(to.number || to.street_number || ''),
      complement: to.complement || '',
      district: to.neighborhood || '',
      city: to.city,
      country_id: 'BR',
      postal_code: toCep,
      state_abbr: to.state,
    },
    products: [
      {
        name: dce.description,
        quantity: 1,
        unitary_value: dce.total_value,
      },
    ],
    volumes: [
      {
        height: pkg.heightCm,
        width: pkg.widthCm,
        length: pkg.lengthCm,
        weight: pkg.weightG / 1000,
      },
    ],
    options: {
      insurance_value: dce.total_value,
      tags: order_code || order?.order_code ? [{ tag: String(order_code || order.order_code) }] : [],
    },
  };

  // Remove undefined keys Melhor Envio rejeita em alguns campos
  if (!cartBody.from.company_document) delete cartBody.from.company_document;
  if (!cartBody.to.email) delete cartBody.to.email;

  const cart = await meRequest('/me/cart', cartBody, 'POST');
  const cartId = cart?.id;
  if (!cartId) {
    throw new AppError(502, 'MELHOR_ENVIO_ERROR', 'Melhor Envio não retornou id do carrinho', {
      cart,
    });
  }

  let checkout = null;
  let generated = null;
  let tracking = null;
  try {
    checkout = await meRequest('/me/shipment/checkout', { orders: [cartId] }, 'POST');
  } catch (err) {
    // Carrinho criado; checkout pode falhar por saldo — ainda assim persistimos o cart id
    if (order_id) {
      await itemsRepository.updateItem('orders', order_id, {
        dce,
        carrier_order_code: String(cartId),
        freight_carrier: 'melhorenvio',
        date_updated: new Date().toISOString(),
      });
    }
    throw new AppError(
      400,
      'MELHOR_ENVIO_CHECKOUT',
      /unauthorized/i.test(err.message || '')
        ? 'Checkout Melhor Envio sem permissão. No Admin → Serviços externos → Melhor Envio, clique em Autenticar de novo (é necessário o escopo shipping-checkout).'
        : err.message ||
            'Frete adicionado ao carrinho Melhor Envio, mas o checkout falhou (saldo/créditos?).',
      { cart_id: cartId, cause: err.details || err.message }
    );
  }

  try {
    generated = await meRequest('/me/shipment/generate', { orders: [cartId] }, 'POST');
    tracking =
      generated?.tracking ||
      generated?.[cartId]?.tracking ||
      generated?.data?.[0]?.tracking ||
      null;
  } catch (err) {
    if (order_id) {
      await itemsRepository.updateItem('orders', order_id, {
        dce,
        carrier_order_code: String(cartId),
        freight_carrier: 'melhorenvio',
        date_updated: new Date().toISOString(),
      });
    }
    throw new AppError(
      400,
      'MELHOR_ENVIO_GENERATE',
      err.message || 'Checkout ok, mas a geração da etiqueta falhou.',
      { cart_id: cartId, cause: err.details || err.message }
    );
  }

  if (order_id) {
    const trackingCode = pickDisplayTracking(tracking);
    await itemsRepository.updateItem('orders', order_id, {
      dce,
      carrier_order_code: String(cartId),
      tracking_code: trackingCode,
      tracking_code_date: trackingCode ? new Date().toISOString() : null,
      freight_carrier: 'melhorenvio',
      date_updated: new Date().toISOString(),
    });
  }

  return { cart, checkout, generated, tracking: pickDisplayTracking(tracking), dce, cart_id: cartId };
}

async function getShipmentDetails(shipmentId) {
  if (!shipmentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'shipmentId é obrigatório');
  }
  const id = String(shipmentId);

  // Prefer tracking endpoint (status + tracking code); fallback to cart/order show.
  try {
    const trackingMap = await meRequest('/me/shipment/tracking', { orders: [id] }, 'POST');
    const entry = trackingMap?.[id] || trackingMap?.data?.[id] || trackingMap;
    if (entry && (entry.tracking || entry.status || entry.id)) {
      return { id, ...entry };
    }
  } catch {
    /* try next */
  }

  try {
    return await meRequest(`/me/orders/show?id=${encodeURIComponent(id)}`, null, 'GET');
  } catch {
    return meRequest(`/me/cart/${encodeURIComponent(id)}`, null, 'GET');
  }
}

async function clearOrderLabel(orderId) {
  const orderStatuses = require('../orderStatusesService');
  const statuses = await orderStatuses.getOrderStatuses();
  const paid = orderStatuses.getPaidValue(statuses);
  await itemsRepository.updateItem('orders', orderId, {
    tracking_code: null,
    carrier_order_code: null,
    status: paid,
    date_updated: new Date().toISOString(),
  });
}

/**
 * Cancel Melhor Envio shipment/cart item.
 * Upstream: POST /me/shipment/cancel [{ id, reason_id: 2, description }]
 */
async function cancelLabel({ orderId, order: orderArg } = {}) {
  const flags = await storeFreight.getModuleFreightFlags();
  if (!flags.melhorenvio.enabled || !flags.melhorenvio.use_for_label) {
    throw new AppError(403, 'LABEL_NOT_ALLOWED', 'Melhor Envio não está habilitado para etiqueta');
  }

  const order =
    orderArg || (orderId ? await itemsRepository.getItem('orders', orderId) : null);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Pedido não encontrado');

  const shipmentId = order.carrier_order_code || order.tracking_code;
  if (!shipmentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Pedido sem carrier_order_code para cancelar');
  }

  try {
    await meRequest('/me/shipment/cancel-preview', { orders: [String(shipmentId)] }, 'POST');
  } catch {
    /* continue */
  }

  let response;
  try {
    response = await meRequest(
      '/me/shipment/cancel',
      [
        {
          id: String(shipmentId),
          reason_id: 2,
          description: 'Cancelamento via Kunk',
        },
      ],
      'POST'
    );
  } catch (err) {
    try {
      response = await meRequest(`/me/cart/${encodeURIComponent(shipmentId)}`, null, 'DELETE');
    } catch {
      throw err;
    }
  }

  await clearOrderLabel(order.id || orderId);
  return response || { ok: true };
}

module.exports = { createLabel, cancelLabel, getShipmentDetails };
