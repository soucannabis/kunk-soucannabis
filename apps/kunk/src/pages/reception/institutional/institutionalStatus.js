/** Helpers da página de clientes institucionais */

export {
  contentAreaDialogSx,
  contentAreaDialogProps,
  contentAreaSelectProps,
  contentAreaAutocompleteSlotProps,
  CONTENT_AREA_OVERLAY_Z,
} from '../../../layout/contentAreaOverlay.js';

export const FILTER_ALL = '';
export const FILTER_ACTIVE = 'active';
export const FILTER_INACTIVE = 'inactive';
export const FILTER_COMPANY = 'company';
export const FILTER_PERSON = 'person';

export const FILTER_OPTIONS = [
  { value: FILTER_ACTIVE, label: 'Ativos' },
  { value: FILTER_INACTIVE, label: 'Inativos' },
  { value: FILTER_COMPANY, label: 'Empresas' },
  { value: FILTER_PERSON, label: 'Pessoas' },
];

export function isCompany(client) {
  return client?.is_company === true || client?.is_company === 'true' || client?.is_company === 1;
}

export function displayName(client) {
  if (!client) return '—';
  if (client.display_name) return String(client.display_name).trim();
  if (isCompany(client)) return String(client.company_name || '').trim() || '—';
  return (
    [client.representative_name, client.representative_last_name].filter(Boolean).join(' ').trim() ||
    '—'
  );
}

export function receiverDisplayName(client) {
  if (!client) return '—';
  return (
    [client.representative_name, client.representative_last_name].filter(Boolean).join(' ').trim() ||
    '—'
  );
}

export function contactEmail(client) {
  if (!client) return '';
  if (isCompany(client)) return client.company_email || client.representative_email || '';
  return client.representative_email || '';
}

export function contactPhone(client) {
  if (!client) return '';
  if (isCompany(client)) return client.company_phone || client.representative_mobile || '';
  return client.representative_mobile || '';
}

export function documentLabel(client) {
  if (!client) return '—';
  if (isCompany(client)) {
    const cnpj = String(client.company_cnpj || '').replace(/\D/g, '');
    return cnpj ? `CNPJ ${cnpj}` : '—';
  }
  const cpf = String(client.representative_cpf || '').replace(/\D/g, '');
  return cpf ? `CPF ${cpf}` : '—';
}

export function typeLabel(client) {
  return isCompany(client) ? 'Empresa' : 'Pessoa';
}

export function statusLabel(client) {
  const s = String(client?.status || '').toLowerCase();
  if (s === 'inactive' || s === 'inativo') return 'Inativo';
  return 'Ativo';
}

export function matchesFilter(client, filter) {
  if (!filter) return true;
  if (filter === FILTER_ACTIVE) return String(client.status || '').toLowerCase() === 'active';
  if (filter === FILTER_INACTIVE) {
    const s = String(client.status || '').toLowerCase();
    return s === 'inactive' || s === 'inativo';
  }
  if (filter === FILTER_COMPANY) return isCompany(client);
  if (filter === FILTER_PERSON) return !isCompany(client);
  return true;
}

export function formatCreated(row) {
  const raw = row?.date_created || row?.created_date;
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

export function parseAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
