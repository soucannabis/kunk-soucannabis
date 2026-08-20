import {
  KUNK_APPEARANCE_DEFAULTS,
  KUNK_BRANDING_ENV_KEYS,
  KUNK_CONFIG_TO_ENV,
} from '@kunk/config';

export const KUNK_CONFIG_SYSTEM = 'kunk';

/** Descriptions for createConfig when a seed row is missing. */
const KEY_DESCRIPTIONS = {
  VITE_KUNK_TITLE: 'Título exibido na sidebar do Kunk',
  VITE_KUNK_LOGO: 'URL ou path do logo (sidebar / login)',
  VITE_KUNK_BG_MODE: 'Fundo do sistema: color ou image',
  VITE_KUNK_BG_COLOR: 'Cor de fundo quando bg_mode=color',
  VITE_KUNK_BG_IMAGE: 'URL da imagem de fundo quando bg_mode=image',
  VITE_KUNK_MENU_BG: 'Cor de fundo do menu lateral',
  VITE_KUNK_MENU_TEXT: 'Cor da fonte do menu',
  VITE_KUNK_MENU_HOVER_BG: 'Cor de fundo no hover do menu',
  VITE_KUNK_MENU_HOVER_TEXT: 'Cor do texto/ícone no hover do menu',
  VITE_KUNK_DEFAULT_THEME: 'Tema padrão se o usuário não tiver preferência: dark ou light',
  VITE_KUNK_DARK_BG: 'Fundo do tema escuro',
  VITE_KUNK_DARK_PRIMARY: 'Verde (primary) do tema escuro',
  VITE_KUNK_DARK_ACCENT: 'Roxo (accent) do tema escuro',
  VITE_KUNK_DARK_ACCENT_HOVER: 'Hover do accent no tema escuro',
  VITE_KUNK_LIGHT_BG: 'Fundo do tema claro',
  VITE_KUNK_LIGHT_PRIMARY: 'Verde (primary) do tema claro',
  VITE_KUNK_LIGHT_ACCENT: 'Roxo (accent) do tema claro',
  VITE_KUNK_LIGHT_ACCENT_HOVER: 'Hover do accent no tema claro',
};

/**
 * Load appearance form values + config row map from system_configs.
 * @returns {Promise<{ values: typeof KUNK_APPEARANCE_DEFAULTS, itemsByKey: Record<string, object> }>}
 */
export async function loadKunkAppearance(api) {
  const values = { ...KUNK_APPEARANCE_DEFAULTS };
  const itemsByKey = {};

  try {
    const res = await api.configBySystem(KUNK_CONFIG_SYSTEM);
    const items = res.data?.items || [];
    for (const item of items) {
      itemsByKey[item.key] = item;
      const prop = Object.entries(KUNK_CONFIG_TO_ENV).find(([, env]) => env === item.key)?.[0];
      if (!prop) continue;
      const raw = item.value ?? item.resolved_value ?? item.hardcoded_default;
      if (raw === undefined || raw === null) continue;
      values[prop] = String(raw);
    }
  } catch {
    /* keep defaults */
  }

  if (values.bgMode !== 'image' && values.bgMode !== 'color') values.bgMode = 'color';
  if (values.defaultTheme !== 'light' && values.defaultTheme !== 'dark') values.defaultTheme = 'dark';

  return { values, itemsByKey };
}

/**
 * Persist only changed appearance fields.
 * @param {object} api
 * @param {Record<string, string>} nextValues camelCase form values
 * @param {Record<string, string>} baselineValues previous values
 * @param {Record<string, object>} itemsByKey existing config rows by env key
 */
export async function saveKunkAppearance(api, nextValues, baselineValues, itemsByKey) {
  const updatedItems = { ...itemsByKey };

  for (const envKey of KUNK_BRANDING_ENV_KEYS) {
    const prop = Object.entries(KUNK_CONFIG_TO_ENV).find(([, env]) => env === envKey)?.[0];
    if (!prop) continue;
    const next = String(nextValues[prop] ?? '');
    const prev = String(baselineValues[prop] ?? '');
    if (next === prev) continue;

    const existing = updatedItems[envKey];
    const description = KEY_DESCRIPTIONS[envKey] || envKey;
    const hardcoded = String(KUNK_APPEARANCE_DEFAULTS[prop] ?? '');

    if (existing?.id) {
      const res = await api.updateConfig(existing.id, {
        value: next,
        description,
        value_type: 'string',
      });
      if (res.data) updatedItems[envKey] = res.data;
    } else {
      const res = await api.createConfig({
        system: KUNK_CONFIG_SYSTEM,
        key: envKey,
        value: next,
        value_type: 'string',
        description,
        allow_hardcoded: true,
        hardcoded_default: hardcoded,
        is_sensitive: false,
      });
      if (res.data) updatedItems[envKey] = res.data;
    }
  }

  return updatedItems;
}

/**
 * Upload an image file and return a download URL path for storage in config.
 */
export async function uploadAppearanceAsset(api, file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('filename', file.name || 'appearance-asset');
  const res = await api.uploadFile(fd);
  const id = res.data?.id;
  if (!id) throw new Error('Upload sem id de arquivo');
  return `/api/v1/files/${id}/download`;
}
