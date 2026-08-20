'use strict';

const { meRequest } = require('./auth');
const storeFreight = require('../storeFreightConfig');
const { melhorEnvioOption } = require('../freightNormalize');
const { AppError } = require('../../utils/response');

async function quote({ address, cepTo }) {
  const cfg = await storeFreight.getStoreFreightConfig();
  storeFreight.assertShipFrom(cfg.ship_from);
  storeFreight.assertPackage(cfg.package);

  const from = String(cfg.ship_from.cep || '').replace(/\D/g, '');
  const to = String(cepTo || address?.cep || '').replace(/\D/g, '');
  if (!to || to.length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CEP de destino inválido');
  }

  const pkg = storeFreight.normalizePackage(cfg.package);
  const body = {
    from: { postal_code: from },
    to: { postal_code: to },
    products: [
      {
        id: '1',
        width: pkg.widthCm,
        height: pkg.heightCm,
        length: pkg.lengthCm,
        weight: pkg.weightG / 1000,
        insurance_value: Number(
          cfg.content_declaration?.total_value ?? cfg.content_declaration?.totalValue ?? 0
        ),
        quantity: 1,
      },
    ],
  };

  const enabledIds = cfg.melhorenvio_enabled_service_ids;
  if (Array.isArray(enabledIds) && enabledIds.length) {
    body.services = enabledIds.join(',');
  }

  const response = await meRequest('/me/shipment/calculate', body, 'POST');
  const list = Array.isArray(response) ? response : [];
  const options = list
    .filter((row) => !row.error && (row.price != null || row.custom_price != null))
    .map((row) =>
      melhorEnvioOption({
        company_id: row.company?.id,
        company_name: row.company?.name,
        service_id: row.id,
        service_name: row.name,
        price: row.custom_price ?? row.price,
        eta_days: row.delivery_time,
      })
    );

  if (!options.length) {
    const carrierErrors = [
      ...new Set(
        list
          .map((row) => row.error)
          .filter(Boolean)
          .map((msg) => String(msg).trim())
      ),
    ];
    const hint = carrierErrors.length
      ? carrierErrors.slice(0, 3).join(' · ')
      : 'Nenhuma cotação Melhor Envio para este CEP';
    throw new AppError(400, 'FREIGHT_NO_QUOTE', hint, {
      cep: to,
      carrier_errors: carrierErrors,
    });
  }
  return { options, raw: response };
}

async function listCompanies() {
  return meRequest('/me/shipment/companies', null, 'GET');
}

async function listServices() {
  const companies = await listCompanies();
  const options = [];
  for (const company of companies || []) {
    for (const service of company.services || []) {
      options.push({
        option_key: `melhorenvio:${company.id}:${service.id}`,
        company_id: company.id,
        company_name: company.name,
        service_id: service.id,
        service_name: service.name,
        label: `${company.name} ${service.name}`,
      });
    }
  }
  return { provider: 'melhorenvio', options };
}

module.exports = { quote, listCompanies, listServices };
