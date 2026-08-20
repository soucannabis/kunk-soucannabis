/**
 * Tipos de documento do Kunk (upload global).
 * Prefixo entra no filename; doc_kind/subject vão para users_files.
 *
 * Prefixos OSS (ajustados vs legado):
 * - doc-identidade- → doc-associado-
 * - Receita- → receita-
 */

export const DOCUMENT_KINDS = {
  identity_responsible: {
    key: 'identity_responsible',
    label: 'Documento do Associado',
    prefix: 'doc-associado-',
    doc_kind: 'identity',
    subject: 'responsible',
  },
  identity_patient: {
    key: 'identity_patient',
    label: 'Documento do paciente',
    prefix: 'doc-paciente-',
    doc_kind: 'identity',
    subject: 'patient',
  },
  prescription: {
    key: 'prescription',
    label: 'Receita',
    prefix: 'receita-',
    doc_kind: 'prescription',
    subject: null,
  },
  report: {
    key: 'report',
    label: 'Laudo',
    prefix: 'laudo-',
    doc_kind: 'report',
    subject: null,
  },
  exam: {
    key: 'exam',
    label: 'Exame',
    prefix: 'exame-',
    doc_kind: 'exam',
    subject: null,
  },
};

export const DOCUMENT_KIND_KEYS = Object.keys(DOCUMENT_KINDS);

export function getDocumentKind(kind) {
  return DOCUMENT_KINDS[kind] || null;
}

function getFileExtension(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function sanitizeNamePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/gi, 'c')
    .replace(/\s+/g, '');
}

/**
 * {prefix}{nome}-{sobrenome}-{user_code}.{ext}
 */
export function buildDocumentFileName(kindOrConfig, user, originalName) {
  const cfg = typeof kindOrConfig === 'string' ? getDocumentKind(kindOrConfig) : kindOrConfig;
  if (!cfg?.prefix) throw new Error('Tipo de documento inválido');
  const ext = getFileExtension(originalName);
  const first =
    user?.associate_name || user?.name || user?.first_name || user?.name_associate || '';
  const last =
    user?.associate_last_name ||
    user?.last_name ||
    user?.lastname_associate ||
    user?.lastname ||
    '';
  const code = user?.user_code || user?.id || 'sem-codigo';
  let name = `${cfg.prefix}${first}-${last}-${code}${ext ? `.${ext}` : ''}`;
  name = sanitizeNamePart(name);
  // sanitizeNamePart remove hífens? No - only spaces and accents. Keep hyphens.
  // Wait - sanitizeNamePart only removes spaces via replace(/\s+/g, '') - hyphens stay.
  // But it also runs normalize on the whole string including prefix - fine.
  return name;
}

export function matchesKindPrefix(filename, kind) {
  const cfg = getDocumentKind(kind);
  if (!cfg) return false;
  return String(filename || '')
    .toLowerCase()
    .startsWith(String(cfg.prefix).toLowerCase());
}
