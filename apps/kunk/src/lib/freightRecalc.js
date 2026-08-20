/**
 * Helpers para recálculo de frete após mudança de CEP no pedido.
 */

export function cepDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatCepDisplay(value) {
  const d = cepDigits(value);
  if (d.length !== 8) return d || '—';
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Pedido já teve cotação de serviço (Loggi/ME). */
export function orderHasQuotedFreight(order) {
  if (!order) return false;
  const opt = order.freight_option;
  if (opt && typeof opt === 'object' && (opt.provider || opt.option_key)) return true;
  const carrier = String(order.freight_carrier || '').toLowerCase();
  if (carrier === 'loggi' || carrier === 'melhorenvio') return true;
  return false;
}

export function cepChanged(previousAddress, nextAddress) {
  const a = cepDigits(previousAddress?.cep);
  const b = cepDigits(nextAddress?.cep);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a !== b;
}

/**
 * Escolhe a opção nova que melhor corresponde à cotação antiga.
 */
export function pickMatchingFreightOption(options, previousOption, selectedKey) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return null;
  const prev = previousOption && typeof previousOption === 'object' ? previousOption : null;

  if (prev?.option_key) {
    const byKey = list.find((o) => o.option_key === prev.option_key);
    if (byKey) return byKey;
  }

  if (prev?.provider) {
    const provider = String(prev.provider).toLowerCase();
    const sameProvider = list.filter((o) => String(o.provider || '').toLowerCase() === provider);
    if (sameProvider.length) {
      if (prev.service_id != null) {
        const byService = sameProvider.find(
          (o) => String(o.service_id) === String(prev.service_id)
        );
        if (byService) return byService;
      }
      if (prev.freight_type) {
        const byType = sameProvider.find((o) => o.freight_type === prev.freight_type);
        if (byType) return byType;
      }
      return sameProvider[0];
    }
  }

  if (selectedKey) {
    const bySel = list.find((o) => o.option_key === selectedKey);
    if (bySel) return bySel;
  }
  return list[0];
}

export function freightLabel(option) {
  if (!option || typeof option !== 'object') return 'Frete';
  return (
    option.service_label ||
    [option.company_name, option.service_name].filter(Boolean).join(' ') ||
    option.option_key ||
    option.provider ||
    'Frete'
  );
}

export function productsSubtotal(items = []) {
  return roundMoney(
    (items || []).reduce((sum, item) => {
      const amount = Number(item?.amount) || 0;
      const qty = Number(item?.quantity) || 0;
      return sum + amount * qty;
    }, 0)
  );
}

export function customPaymentSum(customPayment = []) {
  // Pedidos legados/sample podem ter custom_payment como objeto { method, gateway }
  // em vez de array de linhas { item, qnt, value }.
  const rows = Array.isArray(customPayment) ? customPayment : [];
  return roundMoney(rows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0));
}

export function computeOrderTotal({
  items,
  delivery_price,
  apply_to_total = true,
  discount = 0,
  donation = 0,
  custom_payment = [],
}) {
  const products = productsSubtotal(items);
  const freight = apply_to_total === false ? 0 : roundMoney(delivery_price || 0);
  const discountEffective = roundMoney(Number(discount) || 0) + customPaymentSum(custom_payment);
  return roundMoney(Math.max(0, products + freight - discountEffective - (Number(donation) || 0)));
}

/**
 * Deve abrir o assistente após salvar endereço?
 */
export function shouldOfferFreightRecalc(order, previousAddress, nextAddress) {
  return orderHasQuotedFreight(order) && cepChanged(previousAddress, nextAddress);
}
