import {
  STORE_ORDER_STATUS_KEY,
  getOrderStatusDefaults,
  mergeOrderStatusesFromApi,
  normalizeOrderStatuses,
} from '@kunk/config';

export const STORE_CONFIG_SYSTEM = 'store';

/**
 * @returns {Promise<{ statuses: object[], itemsByKey: Record<string, object> }>}
 */
export async function loadOrderStatusesConfig(api) {
  const defaults = getOrderStatusDefaults();
  const itemsByKey = {};
  let raw = null;

  try {
    const res = await api.configBySystem(STORE_CONFIG_SYSTEM);
    const items = res.data?.items || [];
    for (const item of items) {
      itemsByKey[item.key] = item;
      if (item.key === STORE_ORDER_STATUS_KEY) {
        raw = item.value ?? item.resolved_value ?? item.hardcoded_default;
      }
    }
  } catch {
    /* defaults */
  }

  return {
    statuses: mergeOrderStatusesFromApi(raw),
    itemsByKey,
    defaults,
  };
}

export async function saveOrderStatusesConfig(api, statuses, itemsByKey) {
  const normalized = normalizeOrderStatuses(statuses);
  const existing = itemsByKey[STORE_ORDER_STATUS_KEY];
  const body = {
    system: STORE_CONFIG_SYSTEM,
    key: STORE_ORDER_STATUS_KEY,
    value: JSON.stringify(normalized),
    value_type: 'json',
    description: 'Status configuráveis de pedidos (toggle pagamento + bulk)',
  };
  if (existing?.id) {
    await api.updateConfig(existing.id, { value: body.value, value_type: 'json' });
  } else {
    await api.createConfig(body);
  }
  return normalized;
}
