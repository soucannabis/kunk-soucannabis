'use strict';

/** UUID v4-ish (Melhor Envio cart/order id). Not a human tracking code. */
function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

/**
 * Código de rastreio exibível (Loggi numérico / ME alfanumérico).
 * Ignora UUID de carrinho/pedido da transportadora.
 */
function isDisplayTrackingCode(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (isUuidLike(v)) return false;
  if (/^aguardando/i.test(v)) return false;
  if (/^https?:\/\//i.test(v)) return false;
  return v.length >= 5;
}

function pickDisplayTracking(...candidates) {
  for (const c of candidates) {
    if (isDisplayTrackingCode(c)) return String(c).trim();
  }
  return null;
}

function hasStreetAddress(addr) {
  return Boolean(addr && typeof addr === 'object' && String(addr.street || '').trim());
}

function cadastralAddressFromUser(u) {
  if (!u) return null;
  const street = u.street || u.address?.street;
  if (!street) return null;
  return {
    street,
    number: u.street_number || u.number || u.address?.number || '',
    complement: u.complement || u.address?.complement || '',
    neighborhood: u.neighborhood || u.address?.neighborhood || '',
    city: u.city || u.address?.city || '',
    state: u.state || u.address?.state || '',
    cep: u.cep || u.postal_code || u.address?.cep || '',
    country: 'BR',
  };
}

function deliveryAddressFromUser(u) {
  if (!u) return null;
  const d = u.delivery_address || u.address_delivery;
  if (hasStreetAddress(d)) return d;
  return cadastralAddressFromUser(u);
}

module.exports = {
  isUuidLike,
  isDisplayTrackingCode,
  pickDisplayTracking,
  hasStreetAddress,
  deliveryAddressFromUser,
  cadastralAddressFromUser,
};
