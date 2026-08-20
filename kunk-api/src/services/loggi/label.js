'use strict';

const { loggiRequest } = require('./client');
const storeFreight = require('../storeFreightConfig');
const itemsRepository = require('../../repositories/itemsRepository');
const { AppError } = require('../../utils/response');
const { pickDisplayTracking } = require('../orderAddressTracking');
const { loadRecipientContact, onlyDigits } = require('../recipientContact');

/**
 * Fluxo Loggi async-shipments (formato oficial legado/OSS).
 * shipFrom/shipTo com name, federalTaxId, phoneNumber, address.lineAddress;
 * package com freightType + documentTypes.contentDeclaration.
 */
async function createLabel({ user, address, name_associate, order_id, freight_option }) {
  const flags = await storeFreight.getModuleFreightFlags();
  if (!flags.loggi.use_for_label) {
    throw new AppError(403, 'LABEL_NOT_ALLOWED', 'Loggi não está habilitada para etiqueta');
  }

  const cfg = await storeFreight.getStoreFreightConfig();
  storeFreight.assertShipFromForLabel(cfg.ship_from);
  storeFreight.assertContentDeclaration(cfg.content_declaration);
  const pkgSource = cfg.label_package || cfg.package;
  storeFreight.assertPackage(pkgSource);
  const pkg = storeFreight.normalizePackage(pkgSource);

  const dce = {
    description: String(cfg.content_declaration.description || '').trim(),
    total_value: Number(cfg.content_declaration.total_value ?? cfg.content_declaration.totalValue),
  };

  let order = null;
  if (order_id) {
    order = await itemsRepository.getItem('orders', order_id);
  }

  const contact = await loadRecipientContact(order);
  const toAddress = address || order?.address || {};
  const recipientName =
    name_associate ||
    order?.receiver_name ||
    order?.associate_name ||
    contact.name ||
    user?.name ||
    'Destinatário';

  const toDocument = onlyDigits(toAddress.document || toAddress.cpf || contact.document);
  const toPhone = onlyDigits(toAddress.phone || contact.phone || user?.mobile_number || user?.phone);
  if (!toPhone || toPhone.length < 10) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Telefone do destinatário é obrigatório para etiqueta Loggi. Atualize o celular do associado ou cliente institucional.'
    );
  }
  if (!toDocument || (toDocument.length !== 11 && toDocument.length !== 14)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'CPF/CNPJ do destinatário é obrigatório para etiqueta Loggi. Atualize o documento do associado ou cliente institucional.'
    );
  }
  if (!String(toAddress.street || '').trim() || !onlyDigits(toAddress.cep).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Endereço do pedido incompleto para etiqueta Loggi');
  }

  const freightType =
    freight_option?.freight_type ||
    freight_option?.freightType ||
    order?.freight_option?.freight_type ||
    'FREIGHT_TYPE_ECONOMIC';

  const sisus = storeFreight.resolveLoggiExternalServiceIds(cfg);
  const externalServiceId = storeFreight.pickLoggiExternalServiceId(
    freight_option?.external_service_id,
    freight_option?.externalServiceId,
    order?.freight_option?.external_service_id,
    order?.freight_option?.externalServiceId,
    sisus[0]
  );
  if (!externalServiceId) {
    throw new AppError(
      400,
      'CONFIG_INCOMPLETE',
      'SISU Loggi (externalServiceId) não configurado. Em Admin → Loja, preencha store.freight.loggi.external_service_ids com o código homologado (ex.: DLVR-DROF-DOOR-STAN-01). Sem isso a Loggi devolve código fantasma que não aparece no app.',
      { missing: ['store.freight.loggi.external_service_ids'] }
    );
  }

  const body = {
    externalServiceId: String(externalServiceId),
    shipFrom: storeFreight.shipFromToLoggiShipment(cfg.ship_from),
    shipTo: storeFreight.personToLoggiShipment({
      name: recipientName,
      phone: toPhone,
      document: toDocument,
      email: toAddress.email || contact.email || undefined,
      address: toAddress,
      instructions: `Entregar para ${recipientName}`,
    }),
    packages: [
      {
        freightType,
        weightG: pkg.weightG,
        lengthCm: pkg.lengthCm,
        widthCm: pkg.widthCm,
        heightCm: pkg.heightCm,
        documentTypes: [
          {
            contentDeclaration: {
              totalValue: String(dce.total_value),
              description: dce.description,
            },
          },
        ],
        packaged: true,
        labelled: true,
      },
    ],
  };

  const response = await loggiRequest('/async-shipments', body, 'POST');

  const packages = Array.isArray(response?.packages) ? response.packages : [];
  const pkg0 = packages[0] || {};
  // Legado: packages[0].trackingCode é a fonte canônica (não usar loggiKey no path de GET)
  const tracking = pickDisplayTracking(pkg0.trackingCode, response?.trackingCode);
  const carrierId = pkg0.loggiKey || response?.loggiKey || null;

  if (!tracking) {
    throw new AppError(
      502,
      'LOGGI_ERROR',
      'Loggi não retornou trackingCode na criação do envio',
      { response }
    );
  }

  // Sem SISU/CNPJ corretos a API aceita e devolve códigos que nunca viram pacote
  try {
    await assertLoggiPackageVisible(tracking);
  } catch (err) {
    try {
      const qs = new URLSearchParams({ tracking_code: tracking });
      if (carrierId) qs.set('loggi_key', String(carrierId));
      await loggiRequest(`/packages/cancel?${qs.toString()}`, null, 'POST');
    } catch {
      /* best-effort */
    }
    throw err;
  }

  if (order_id) {
    await itemsRepository.updateItem('orders', order_id, {
      dce: {
        ...(order?.dce && typeof order.dce === 'object' ? order.dce : {}),
        loggiDeclaration: dce,
        updatedAt: new Date().toISOString(),
      },
      tracking_code: tracking,
      carrier_order_code: carrierId ? String(carrierId) : null,
      tracking_code_date: new Date().toISOString(),
      freight_carrier: 'loggi',
      date_updated: new Date().toISOString(),
    });
  }

  return { ...response, dce, tracking_code: tracking, loggi_key: carrierId };
}

async function assertLoggiPackageVisible(trackingCode, { attempts = 5, delayMs = 700 } = {}) {
  const code = String(trackingCode || '').trim();
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await loggiRequest(`/packages/${encodeURIComponent(code)}`, null, 'GET');
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new AppError(
    502,
    'LOGGI_ERROR',
    'Loggi aceitou a solicitação, mas o pacote não foi criado. Confira o SISU (external_service_ids) e o CNPJ do remetente em Dados de envio — devem ser os da conta Loggi homologada (não use CPF pessoal).',
    {
      tracking_code: code,
      cause: lastErr?.message || String(lastErr),
    }
  );
}

async function cancelPackage({ orderId, tracking_code, loggi_key, order: orderArg } = {}) {
  const code = String(tracking_code || '').trim();
  let loggiKey = String(loggi_key || '').trim();

  let order = orderArg || null;
  if (orderId && !order) {
    order = await itemsRepository.getItem('orders', orderId);
  }
  if (!loggiKey && order?.carrier_order_code) {
    loggiKey = String(order.carrier_order_code).trim();
  }
  const tracking = code || pickDisplayTracking(order?.tracking_code) || String(order?.tracking_code || '').trim();

  if (!tracking && !loggiKey) {
    throw new AppError(400, 'VALIDATION_ERROR', 'tracking_code ou loggi_key é obrigatório');
  }

  // Oficial: POST /packages/cancel?tracking_code=&loggi_key= (sem body)
  const qs = new URLSearchParams();
  if (loggiKey) qs.set('loggi_key', loggiKey);
  if (tracking) qs.set('tracking_code', tracking);
  const response = await loggiRequest(`/packages/cancel?${qs.toString()}`, null, 'POST');

  if (orderId || order?.id) {
    const id = orderId || order.id;
    const orderStatuses = require('../orderStatusesService');
    const statuses = await orderStatuses.getOrderStatuses();
    const paid = orderStatuses.getPaidValue(statuses);
    await itemsRepository.updateItem('orders', id, {
      tracking_code: null,
      carrier_order_code: null,
      status: paid,
      date_updated: new Date().toISOString(),
    });
  }
  return response;
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function mergeLoggiPackageDetails(detailsPkg, trackingPkg) {
  if (!detailsPkg && !trackingPkg) return null;
  if (!detailsPkg) return { ...trackingPkg };
  if (!trackingPkg) return { ...detailsPkg };
  return {
    ...detailsPkg,
    ...trackingPkg,
    loggiKey: pickDefined(trackingPkg.loggiKey, detailsPkg.loggiKey),
    trackingCode: pickDefined(trackingPkg.trackingCode, detailsPkg.trackingCode),
    barcode: pickDefined(trackingPkg.barcode, detailsPkg.barcode),
    status: pickDefined(trackingPkg.status, detailsPkg.status),
    promisedDate: pickDefined(trackingPkg.promisedDate, detailsPkg.promisedDate),
    requestTime: pickDefined(trackingPkg.requestTime, detailsPkg.requestTime),
    deliveryInformation: pickDefined(
      trackingPkg.deliveryInformation,
      detailsPkg.deliveryInformation
    ),
    pickup_receipt: pickDefined(trackingPkg.pickup_receipt, detailsPkg.pickup_receipt),
    destination: detailsPkg.destination,
    dimension: detailsPkg.dimension,
    invoice: detailsPkg.invoice,
    origin: detailsPkg.origin,
    receiver: pickDefined(trackingPkg.receiver, detailsPkg.receiver),
    pricing: detailsPkg.pricing,
    slo: detailsPkg.slo,
    location: trackingPkg.location,
    trackingHistory: trackingPkg.trackingHistory,
  };
}

/**
 * Detalhes + histórico de rastreio (legado: POST /packages).
 * Tenta trackingCode e, se 404, loggiKey.
 */
async function getPackages({ trackingCode, loggiKey } = {}) {
  const candidates = [
    String(trackingCode || '').trim(),
    String(loggiKey || '').trim(),
  ].filter((c, i, arr) => c && arr.indexOf(c) === i);

  if (!candidates.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'trackingCode é obrigatório');
  }

  let lastErr = null;
  for (const code of candidates) {
    const [detailsResult, trackingResult] = await Promise.allSettled([
      loggiRequest(`/packages/${encodeURIComponent(code)}`, null, 'GET'),
      loggiRequest(`/packages/${encodeURIComponent(code)}/tracking`, null, 'GET'),
    ]);

    if (detailsResult.status === 'rejected' && trackingResult.status === 'rejected') {
      lastErr = detailsResult.reason;
      const notFound =
        lastErr?.status === 404 || /não encontrado|not found/i.test(String(lastErr?.message || ''));
      if (notFound) continue;
      if (lastErr instanceof AppError) throw lastErr;
      throw new AppError(404, 'LOGGI_NOT_FOUND', lastErr?.message || 'Pacote Loggi não encontrado', {
        tracking_code: code,
      });
    }

    const detailsPkg =
      detailsResult.status === 'fulfilled'
        ? detailsResult.value?.packages?.[0] ?? detailsResult.value ?? null
        : null;
    const trackingPkg =
      trackingResult.status === 'fulfilled'
        ? trackingResult.value?.packages?.[0] ?? trackingResult.value ?? null
        : null;

    const merged = mergeLoggiPackageDetails(detailsPkg, trackingPkg);
    if (!merged) {
      lastErr = new AppError(404, 'LOGGI_NOT_FOUND', 'Pacote Loggi não encontrado', {
        tracking_code: code,
      });
      continue;
    }

    return {
      packages: [merged],
      trackingPartial: trackingResult.status === 'rejected',
      trackingCode: merged.trackingCode || code,
      loggiKey: merged.loggiKey || null,
      status: merged.status || null,
      location: merged.location || null,
      trackingHistory: merged.trackingHistory || null,
      deliveryInformation: merged.deliveryInformation || null,
      package: merged,
    };
  }

  if (lastErr instanceof AppError) throw lastErr;
  throw new AppError(
    404,
    'LOGGI_NOT_FOUND',
    lastErr?.message || 'Pacote Loggi não encontrado',
    { tried: candidates }
  );
}

module.exports = { createLabel, cancelPackage, getPackages, mergeLoggiPackageDetails };
