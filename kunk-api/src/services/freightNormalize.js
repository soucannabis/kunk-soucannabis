'use strict';

/**
 * Normalize freight options from providers into cart facade shape.
 */

function loggiOption(q) {
  const freightType = q.freight_type || q.freightType || 'FREIGHT_TYPE_ECONOMIC';
  const label = q.service_label || q.freightTypeLabel || freightType;
  return {
    option_key: `loggi:${freightType}`,
    provider: 'loggi',
    company_name: 'Loggi',
    service_name: label.replace(/^Loggi\s+/i, '') || label,
    service_label: label.startsWith('Loggi') ? label : `Loggi ${label}`,
    freight_type: freightType,
    external_service_id: q.external_service_id || q.externalServiceId || null,
    price: Number(q.price ?? q.totalAmount) || 0,
    eta_days: q.eta_days ?? q.sloInDays ?? null,
    status: 'ready',
  };
}

function melhorEnvioOption(q) {
  const companyId = q.company_id ?? q.company?.id ?? 0;
  const serviceId = q.service_id ?? q.id ?? 0;
  const companyName = q.company_name || q.company?.name || 'Transportadora';
  const serviceName = q.service_name || q.name || 'Serviço';
  return {
    option_key: `melhorenvio:${companyId}:${serviceId}`,
    provider: 'melhorenvio',
    company_id: companyId,
    company_name: companyName,
    service_id: serviceId,
    service_name: serviceName,
    service_label: `${companyName} ${serviceName}`.trim(),
    price: Number(q.price ?? q.custom_price ?? q.price) || 0,
    eta_days: q.eta_days ?? q.delivery_time ?? null,
    status: 'ready',
  };
}

const LOGGI_SERVICE_CATALOG = [
  {
    option_key: 'loggi:FREIGHT_TYPE_ECONOMIC',
    freight_type: 'FREIGHT_TYPE_ECONOMIC',
    label: 'Loggi Econômico',
    external_service_id: null,
  },
  {
    option_key: 'loggi:FREIGHT_TYPE_EXPRESS',
    freight_type: 'FREIGHT_TYPE_EXPRESS',
    label: 'Loggi Expresso',
    external_service_id: null,
  },
];

module.exports = {
  loggiOption,
  melhorEnvioOption,
  LOGGI_SERVICE_CATALOG,
};
