import { ASSOCIATION_DATA_CONFIG_TO_ENV } from '@kunk/config';

/** Campos obrigatórios de Dados da associação (admin) para liberar o doc-sign. */
export const ASSOCIATION_REQUIRED_FIELDS = [
  { key: 'associationName', envKey: 'VITE_ASSOCIATION_NAME', label: 'Nome da associação' },
  { key: 'associationFullName', envKey: 'VITE_ASSOCIATION_FULL_NAME', label: 'Nome completo da associação' },
  { key: 'associationEmail', envKey: 'VITE_ASSOCIATION_EMAIL', label: 'E-mail' },
  { key: 'associationPhone', envKey: 'VITE_ASSOCIATION_PHONE', label: 'Telefone' },
  { key: 'associationSite', envKey: 'VITE_ASSOCIATION_SITE', label: 'Site' },
  { key: 'associationCnpj', envKey: 'VITE_ASSOCIATION_CNPJ', label: 'CNPJ' },
  { key: 'associationCity', envKey: 'VITE_ASSOCIATION_CITY', label: 'Cidade' },
  { key: 'associationState', envKey: 'VITE_ASSOCIATION_STATE', label: 'Estado' },
];

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isFieldFilled(envKey, raw) {
  const value = String(raw ?? '').trim();
  if (!value) return false;
  if (envKey === 'VITE_ASSOCIATION_PHONE') return onlyDigits(value).length >= 10;
  if (envKey === 'VITE_ASSOCIATION_CNPJ') return onlyDigits(value).length === 14;
  return true;
}

/**
 * Lê valores persistidos em system_configs (registration) e retorna labels faltantes.
 * Usa apenas `value` do banco (não hardcoded/env).
 */
export async function getMissingAssociationFields(api) {
  const res = await api.configBySystem('registration');
  const items = res.data?.items || [];
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));

  const missing = [];
  for (const field of ASSOCIATION_REQUIRED_FIELDS) {
    const envKey = field.envKey || ASSOCIATION_DATA_CONFIG_TO_ENV[field.key];
    const item = byKey[envKey];
    const raw = item?.value;
    if (!isFieldFilled(envKey, raw)) missing.push(field.label);
  }
  return missing;
}
