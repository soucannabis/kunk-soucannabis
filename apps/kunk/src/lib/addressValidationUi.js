'use strict';

export const ADDRESS_VALIDATION_REASON_LABELS_PT = {
  no_features: 'Mapa sem endereços para o texto enviado',
  missing_structured_address: 'Endereço do pedido não estruturado (JSON)',
  missing_cep: 'CEP ausente ou incompleto',
  viacep_skip: 'ViaCEP não aplicável (dados incompletos)',
  viacep_erro_consulta: 'Falha ao consultar ViaCEP',
  viacep_cep_nao_encontrado: 'CEP inexistente nos Correios',
  cep_mismatch_only: 'CEP do mapa diferente do pedido (legado)',
  geoapify_rua_confianca_reduzida_via_cep_ok:
    'Rua com confiança reduzida (CEP ok nos Correios)',
  viacep_endereco_inconsistente_com_correios: 'Pedido diverge do cadastro do CEP nos Correios',
};

export function getAddressValidationReasonLabelPt(reason) {
  if (reason == null || reason === '') return '';
  if (reason === 'no_matching_candidate') return '';
  return ADDRESS_VALIDATION_REASON_LABELS_PT[reason] ?? String(reason);
}

export function getAddressValidationReasonColorKey(reason) {
  if (reason == null || reason === '') return 'text.secondary';
  if (
    reason === 'viacep_endereco_inconsistente_com_correios' ||
    reason === 'viacep_erro_consulta' ||
    reason === 'viacep_cep_nao_encontrado' ||
    reason === 'no_features' ||
    reason === 'missing_cep' ||
    reason === 'missing_structured_address'
  ) {
    return 'error';
  }
  if (reason === 'cep_mismatch_only' || reason === 'geoapify_rua_confianca_reduzida_via_cep_ok') {
    return 'warning';
  }
  return 'text.secondary';
}

export function getConfidenceStreetLevel(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (n <= 0.6) return { label: 'não confiável', color: 'error' };
  if (n <= 0.8) return { label: 'pouco confiável', color: 'warning' };
  return { label: 'confiável', color: 'success' };
}

export function formatAddressTextForValidation(orderOrAddress) {
  const addr =
    orderOrAddress?.address && typeof orderOrAddress.address === 'object'
      ? orderOrAddress.address
      : orderOrAddress;
  if (!addr || typeof addr !== 'object') return '';
  return [addr.street, addr.number, addr.neighborhood, addr.city, addr.state, addr.cep]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' - ');
}

export function formatCepBrDigits(raw) {
  if (raw == null || raw === '') return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 8) return String(raw).trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatViaCepStreetCityLine(data) {
  if (!data || typeof data !== 'object') return '';
  const rua = [data.logradouro, data.complemento].filter((x) => x && String(x).trim()).join(', ');
  const partes = [rua, data.bairro, [data.localidade, data.uf].filter(Boolean).join(' - ')].filter(
    (x) => x && String(x).trim()
  );
  return partes.join(' · ');
}

export function getViaCepDisplayFromResult(result) {
  const via = result?.viacep || result?.viaCep;
  const data = via?.data;
  const cep =
    (data?.cep && String(data.cep).trim()) ||
    (via?.cepConsultado ? formatCepBrDigits(via.cepConsultado) : '');
  const addressLine = formatViaCepStreetCityLine(data);
  return { cep, addressLine };
}

export function buildAddressQueryForMaps(order, validationResult) {
  if (validationResult?.matchedFormatted && String(validationResult.matchedFormatted).trim()) {
    return String(validationResult.matchedFormatted).trim();
  }
  const addr = order?.address;
  if (addr && typeof addr === 'object') {
    const parts = [
      addr.street,
      addr.number,
      addr.neighborhood,
      addr.city,
      addr.state,
      addr.cep,
    ]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  return formatAddressTextForValidation(order);
}

export function openGoogleMapsForQuery(query) {
  if (query == null) return;
  const q = String(query).trim();
  if (!q) return;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    '_blank',
    'noopener,noreferrer'
  );
}
