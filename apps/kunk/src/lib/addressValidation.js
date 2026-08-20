/**
 * Auto-validação de endereço (Geoapify + ViaCEP) — mesma regra do legado:
 * pedidos com endereço estruturado e sem address_validation.
 */

/** Status do GET /modules/geoapify/status — UI de validação só com módulo ativo. */
export function isAddressValidationUiActive(status) {
  return Boolean(status?.enabled && status?.use_for_validation);
}

function hasStructuredAddress(address) {
  if (!address || typeof address !== 'object') return false;
  const street = String(address.street || '').trim();
  const cep = String(address.cep || '').replace(/\D/g, '');
  return Boolean(street && cep.length >= 8);
}

export function orderNeedsAddressValidation(order) {
  if (!order?.id) return false;
  const existing = order.address_validation;
  if (existing != null && String(existing).trim() !== '') return false;
  return hasStructuredAddress(order.address);
}

/**
 * @param {object} api
 * @param {object[]} orders
 * @param {{ forceIds?: Set|number[], concurrency?: number }} [opts]
 * @returns {Promise<{ ran: number, updated: Map<number, string> }>}
 */
export async function processAutoAddressValidation(api, orders, opts = {}) {
  const forceIds = new Set(
    Array.isArray(opts.forceIds) ? opts.forceIds : opts.forceIds ? [...opts.forceIds] : []
  );
  const concurrency = Math.max(1, Number(opts.concurrency) || 2);

  let status;
  try {
    const res = await api.getGeoapifyStatus();
    status = res.data;
  } catch {
    return { ran: 0, updated: new Map() };
  }

  if (!status?.enabled || !status?.use_for_validation || !status?.credentials_complete) {
    return { ran: 0, updated: new Map() };
  }

  const targets = (orders || []).filter((o) => {
    if (forceIds.has(o.id)) return hasStructuredAddress(o.address);
    return orderNeedsAddressValidation(o);
  });

  const updated = new Map();
  let ran = 0;

  for (let i = 0; i < targets.length; i += concurrency) {
    const chunk = targets.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (order) => {
        try {
          const res = await api.validateGeoapifyAddress({
            order_id: order.id,
            address: order.address,
            force: forceIds.has(order.id),
          });
          ran += 1;
          const st = res.data?.status;
          if (st && !res.data?.skipped) {
            updated.set(order.id, st);
          } else if (st) {
            updated.set(order.id, st);
          }
        } catch {
          /* skip individual failures */
        }
      })
    );
  }

  return { ran, updated };
}
