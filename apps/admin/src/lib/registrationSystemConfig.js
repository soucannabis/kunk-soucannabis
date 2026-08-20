import {
  parseEnvBool,
  REGISTRATION_SYSTEM_CONFIG_TO_ENV,
  REGISTRATION_SYSTEM_DEFAULTS,
  REGISTRATION_SYSTEM_ENV_KEYS,
} from '@kunk/config';

export const REGISTRATION_CONFIG_SYSTEM = 'registration';

const KEY_META = {
  VITE_WELCOME_TEXT: {
    description: 'Texto exibido na tela de boas-vindas do cadastramento',
    value_type: 'string',
  },
  VITE_COMPLETION_TEXT: {
    description: 'Texto exibido na tela de cadastro concluído',
    value_type: 'string',
  },
  VITE_SHOW_TRIAGE_BUTTON: {
    description: 'Exibir botão da triagem na tela de cadastro concluído',
    value_type: 'boolean',
  },
  VITE_TRIAGE_FORM_URL: {
    description: 'URL de redirecionamento do formulário de contato/triagem',
    value_type: 'string',
  },
};

function serializeValue(prop, value) {
  if (prop === 'showTriageButton') {
    return parseEnvBool(value, REGISTRATION_SYSTEM_DEFAULTS.showTriageButton) ? 'true' : 'false';
  }
  return String(value ?? '');
}

function deserializeValue(prop, raw) {
  if (prop === 'showTriageButton') {
    return parseEnvBool(raw, REGISTRATION_SYSTEM_DEFAULTS.showTriageButton);
  }
  if (raw == null) return '';
  return String(raw);
}

/**
 * Load registration funnel copy from system_configs (system=registration).
 */
export async function loadRegistrationSystem(api) {
  const values = { ...REGISTRATION_SYSTEM_DEFAULTS };
  const itemsByKey = {};

  try {
    const res = await api.configBySystem(REGISTRATION_CONFIG_SYSTEM);
    const items = res.data?.items || [];
    for (const item of items) {
      itemsByKey[item.key] = item;
      const prop = Object.entries(REGISTRATION_SYSTEM_CONFIG_TO_ENV).find(([, env]) => env === item.key)?.[0];
      if (!prop) continue;
      values[prop] = deserializeValue(prop, item.value);
    }
  } catch {
    /* keep defaults */
  }

  return { values, itemsByKey };
}

/**
 * Persist only changed registration system fields.
 */
export async function saveRegistrationSystem(api, nextValues, baselineValues, itemsByKey) {
  const updatedItems = { ...itemsByKey };

  for (const envKey of REGISTRATION_SYSTEM_ENV_KEYS) {
    const prop = Object.entries(REGISTRATION_SYSTEM_CONFIG_TO_ENV).find(([, env]) => env === envKey)?.[0];
    if (!prop) continue;
    const next = serializeValue(prop, nextValues[prop]);
    const prev = serializeValue(prop, baselineValues[prop]);
    const existing = updatedItems[envKey];
    // Sempre cria a chave se ainda não existir no banco (senão o .env do Vite prevalece).
    if (existing?.id && next === prev) continue;

    const meta = KEY_META[envKey] || { description: envKey, value_type: 'string' };
    const hardcoded = serializeValue(prop, REGISTRATION_SYSTEM_DEFAULTS[prop]);

    if (existing?.id) {
      const res = await api.updateConfig(existing.id, {
        value: next,
        description: meta.description,
        value_type: meta.value_type,
      });
      if (res.data) updatedItems[envKey] = res.data;
    } else {
      const res = await api.createConfig({
        system: REGISTRATION_CONFIG_SYSTEM,
        key: envKey,
        value: next,
        value_type: meta.value_type,
        description: meta.description,
        allow_hardcoded: true,
        hardcoded_default: hardcoded,
        is_sensitive: false,
      });
      if (res.data) updatedItems[envKey] = res.data;
    }
  }

  return updatedItems;
}
