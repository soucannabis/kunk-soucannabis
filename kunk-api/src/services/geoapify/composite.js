'use strict';

/**
 * Política composta sobre os primeiros N features da Geoapify Geocode Search.
 * UF/estado não é comparado — apenas CEP, confiança de rua, cidade e número.
 * Validação composta de endereço (Geoapify)
 */

const MAX_FEATURES = 5;
const MAX_FEATURES_VIACEP = 10;
const MIN_CONFIDENCE_STREET = 0.9;
const MIN_CONFIDENCE_STREET_RELAXED_VIACEP = 0.7;
const MIN_CONFIDENCE_BUILDING = 0.65;

function normalizeDigits(str) {
  if (str == null || str === '') return '';
  return String(str).replace(/\D/g, '');
}

function normalizeCep(cep) {
  const d = normalizeDigits(cep);
  if (d.length === 8) return d;
  return d;
}

function normalizeText(str) {
  if (str == null || str === '') return '';
  return String(str)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function houseNumbersMatch(apiNumber, orderNumber) {
  if (apiNumber == null || orderNumber == null) return false;
  const a = normalizeDigits(apiNumber);
  const b = normalizeDigits(orderNumber);
  if (a !== '' && b !== '' && a === b) return true;
  return normalizeText(String(apiNumber)) === normalizeText(String(orderNumber));
}

function cityMatchesOrder(properties, orderCity) {
  if (!orderCity || !String(orderCity).trim()) return true;
  const oc = normalizeText(orderCity);
  const candidates = [properties.city, properties.municipality, properties.town]
    .filter(Boolean)
    .map((c) => normalizeText(String(c)));
  if (candidates.length === 0) return true;
  return candidates.some((fc) => fc === oc);
}

function passesStreet(rank) {
  const v = rank?.confidence_street_level;
  return typeof v === 'number' && v >= MIN_CONFIDENCE_STREET;
}

function passesStreetMin(rank, minLevel) {
  const v = rank?.confidence_street_level;
  return typeof v === 'number' && v >= minLevel;
}

function passesNumberRule(properties, rank, orderNumber) {
  const num = orderNumber != null ? String(orderNumber).trim() : '';
  if (!num) return true;
  if (properties.result_type === 'building') return true;
  if (properties.housenumber != null && houseNumbersMatch(properties.housenumber, num)) {
    return true;
  }
  const cb = rank?.confidence_building_level;
  if (typeof cb === 'number' && cb >= MIN_CONFIDENCE_BUILDING) return true;
  return false;
}

function cepMatchesFeature(postcode, orderCepDigits) {
  if (!orderCepDigits || orderCepDigits.length !== 8) return false;
  const pc = normalizeCep(postcode);
  return pc === orderCepDigits;
}

function passesCity(properties, orderCity) {
  return cityMatchesOrder(properties, orderCity);
}

function evaluateComposite(features, address) {
  const emptyResult = (status, reason, extra = {}) => ({
    valid: status === 'válido',
    status,
    reason,
    matchedFormatted: null,
    confidence_street_level: null,
    ...extra,
  });

  if (!features.length) return emptyResult('inválido', 'no_features');

  const slice = features.slice(0, MAX_FEATURES);
  const orderCepDigits = normalizeCep(address?.cep != null ? String(address.cep) : '');

  if (!address || typeof address !== 'object') {
    return emptyResult('inválido', 'missing_structured_address');
  }
  if (!orderCepDigits || orderCepDigits.length !== 8) {
    return emptyResult('inválido', 'missing_cep');
  }

  const orderNum = address.number != null ? String(address.number).trim() : '';

  for (const feature of slice) {
    const props = feature.properties || {};
    const rank = props.rank || {};
    if (!passesStreet(rank)) continue;
    if (!cepMatchesFeature(props.postcode, orderCepDigits)) continue;
    if (!passesCity(props, address.city)) continue;
    if (!passesNumberRule(props, rank, orderNum)) continue;
    return {
      valid: true,
      status: 'válido',
      reason: null,
      matchedFormatted: props.formatted || null,
      confidence_street_level:
        rank.confidence_street_level != null ? rank.confidence_street_level : null,
    };
  }

  for (const feature of slice) {
    const props = feature.properties || {};
    const rank = props.rank || {};
    if (!passesStreet(rank)) continue;
    if (cepMatchesFeature(props.postcode, orderCepDigits)) continue;
    if (!passesCity(props, address.city)) continue;
    if (!passesNumberRule(props, rank, orderNum)) continue;
    return {
      valid: false,
      status: 'revisar',
      reason: 'cep_mismatch_only',
      matchedFormatted: props.formatted || null,
      confidence_street_level:
        rank.confidence_street_level != null ? rank.confidence_street_level : null,
    };
  }

  return {
    valid: false,
    status: 'inválido',
    reason: 'no_matching_candidate',
    matchedFormatted: null,
    confidence_street_level:
      slice[0]?.properties?.rank?.confidence_street_level != null
        ? slice[0].properties.rank.confidence_street_level
        : null,
  };
}

function passesViaCepCepExisteCorreios(viacepReport) {
  if (!viacepReport || viacepReport.skipped) return false;
  if (!viacepReport.fetchOk) return false;
  return viacepReport.cepExisteNaBaseCorreios === true;
}

function passesViaCepEnderecoConsistente(viacepReport) {
  if (!passesViaCepCepExisteCorreios(viacepReport)) return false;
  return Boolean(viacepReport.cruzamento?.enderecoConsistenteComCep);
}

function evaluateCompositeWithViaCep(features, address, viacepReport) {
  const emptyResult = (status, reason, extra = {}) => ({
    valid: status === 'válido',
    status,
    reason,
    matchedFormatted: null,
    confidence_street_level: null,
    cepValidatedBy: 'viacep',
    viacep: viacepReport,
    ...extra,
  });

  if (!features.length) return emptyResult('inválido', 'no_features');

  const orderCepDigits = normalizeCep(address?.cep != null ? String(address.cep) : '');

  if (!address || typeof address !== 'object') {
    return emptyResult('inválido', 'missing_structured_address');
  }
  if (!orderCepDigits || orderCepDigits.length !== 8) {
    return emptyResult('inválido', 'missing_cep');
  }
  if (viacepReport == null || viacepReport.skipped) {
    return emptyResult('inválido', 'viacep_skip');
  }
  if (!viacepReport.fetchOk) {
    return emptyResult('inválido', 'viacep_erro_consulta');
  }
  if (viacepReport.cepExisteNaBaseCorreios === false) {
    return emptyResult('inválido', 'viacep_cep_nao_encontrado');
  }

  const orderNum = address.number != null ? String(address.number).trim() : '';
  const slice = features.slice(0, MAX_FEATURES_VIACEP);
  const streetThresholds = [MIN_CONFIDENCE_STREET];
  if (passesViaCepEnderecoConsistente(viacepReport)) {
    streetThresholds.push(MIN_CONFIDENCE_STREET_RELAXED_VIACEP);
  }

  for (const minStreet of streetThresholds) {
    for (const feature of slice) {
      const props = feature.properties || {};
      const rank = props.rank || {};
      if (!passesStreetMin(rank, minStreet)) continue;
      if (!passesCity(props, address.city)) continue;
      if (!passesNumberRule(props, rank, orderNum)) continue;

      if (passesViaCepEnderecoConsistente(viacepReport)) {
        return {
          valid: true,
          status: 'válido',
          reason:
            minStreet < MIN_CONFIDENCE_STREET
              ? 'geoapify_rua_confianca_reduzida_via_cep_ok'
              : null,
          matchedFormatted: props.formatted || null,
          confidence_street_level:
            rank.confidence_street_level != null ? rank.confidence_street_level : null,
          cepValidatedBy: 'viacep',
          viacep: viacepReport,
        };
      }

      return {
        valid: false,
        status: 'revisar',
        reason: 'viacep_endereco_inconsistente_com_correios',
        matchedFormatted: props.formatted || null,
        confidence_street_level:
          rank.confidence_street_level != null ? rank.confidence_street_level : null,
        cepValidatedBy: 'viacep',
        viacep: viacepReport,
      };
    }
  }

  return {
    valid: false,
    status: 'inválido',
    reason: 'no_matching_candidate',
    matchedFormatted: null,
    confidence_street_level:
      slice[0]?.properties?.rank?.confidence_street_level != null
        ? slice[0].properties.rank.confidence_street_level
        : null,
    cepValidatedBy: 'viacep',
    viacep: viacepReport,
  };
}

module.exports = {
  evaluateComposite,
  evaluateCompositeWithViaCep,
  normalizeCep,
  MAX_FEATURES,
  MAX_FEATURES_VIACEP,
  MIN_CONFIDENCE_STREET,
  MIN_CONFIDENCE_STREET_RELAXED_VIACEP,
  MIN_CONFIDENCE_BUILDING,
};
