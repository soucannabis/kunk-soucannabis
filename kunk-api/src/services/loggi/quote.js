'use strict';

const { loggiRequest } = require('./client');
const storeFreight = require('../storeFreightConfig');
const { loggiOption } = require('../freightNormalize');
const { AppError } = require('../../utils/response');

function toMoneyProto(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const units = Math.trunc(amount);
  const nanos = Math.round((amount - units) * 1e9);
  return { currencyCode: 'BRL', units: String(units), nanos };
}

function fromMoneyProto(money) {
  if (!money) return null;
  const units = Number(money.units) || 0;
  const nanos = Number(money.nanos) || 0;
  return Math.round((units + nanos / 1e9) * 100) / 100;
}

function extractQuotations(response) {
  const packagesQuotations = response?.packagesQuotations ?? [];
  return packagesQuotations.flatMap((pkg, index) =>
    (pkg.quotations ?? []).map((quote) => ({
      packageIndex: index,
      externalServiceId: quote.externalServiceId ?? null,
      freightType: quote.freightType ?? null,
      freightTypeLabel: quote.freightTypeLabel ?? null,
      sloInDays: quote.sloInDays ?? null,
      totalAmount: fromMoneyProto(quote.price?.totalAmount),
      raw: quote,
    }))
  );
}

async function buildQuoteBody(address) {
  const cfg = await storeFreight.getStoreFreightConfig();
  storeFreight.assertShipFrom(cfg.ship_from);
  storeFreight.assertPackage(cfg.package);
  storeFreight.assertContentDeclaration(cfg.content_declaration);

  const pkg = storeFreight.normalizePackage(cfg.package);
  const goodsValue = Number(
    cfg.content_declaration.total_value ?? cfg.content_declaration.totalValue
  );

  const body = {
    shipFrom: storeFreight.shipFromToLoggi(cfg.ship_from),
    shipTo: storeFreight.addressToShipTo(address),
    packages: [
      {
        ...pkg,
        goodsValue: toMoneyProto(goodsValue),
      },
    ],
  };

  const sisus = storeFreight.resolveLoggiExternalServiceIds(cfg);
  if (sisus.length) {
    body.externalServiceIds = sisus;
  }

  return body;
}

async function quoteFreight(address) {
  if (!address?.cep) {
    throw new AppError(400, 'VALIDATION_ERROR', 'address.cep é obrigatório');
  }
  const cfg = await storeFreight.getStoreFreightConfig();
  const sisus = storeFreight.resolveLoggiExternalServiceIds(cfg);
  const fallbackSisu = sisus[0] || null;
  const body = await buildQuoteBody(address);
  const response = await loggiRequest('/quotations', body, 'POST');
  const quotations = extractQuotations(response);
  const options = quotations
    .filter((q) => q.totalAmount != null)
    .map((q) =>
      loggiOption({
        freight_type: q.freightType,
        service_label: q.freightTypeLabel || q.freightType,
        price: q.totalAmount,
        eta_days: q.sloInDays,
        external_service_id: storeFreight.pickLoggiExternalServiceId(
          q.externalServiceId,
          fallbackSisu
        ),
      })
    );

  if (!options.length) {
    throw new AppError(400, 'FREIGHT_NO_QUOTE', 'Nenhuma cotação Loggi para este endereço');
  }
  return { options, raw: response };
}

module.exports = {
  quoteFreight,
  buildQuoteBody,
  extractQuotations,
  toMoneyProto,
  fromMoneyProto,
};
