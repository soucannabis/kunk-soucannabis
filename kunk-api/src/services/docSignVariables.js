'use strict';

/** Canonical TipTap variable names for doc-sign templates. */
const CANONICAL_VARIABLES = [
  'responsible_full_name',
  'patient_full_name',
  'responsible_cpf',
  'patient_cpf',
  'responsible_rg',
  'associate_rg_issuer',
  'nationality',
  'marital_status',
  'email',
  'street',
  'street_number',
  'city',
  'neighborhood',
  'state',
  'cep',
  'current_date',
  'association_name',
  'association_full_name',
  'association_city',
  'association_state',
  'association_cnpj',
  'association_site',
  'signature',
  'user_code',
];

const VARIABLE_LABELS = {
  responsible_full_name: 'Nome do Responsável',
  patient_full_name: 'Nome do Paciente',
  responsible_cpf: 'CPF Responsável',
  patient_cpf: 'CPF Paciente',
  responsible_rg: 'RG',
  associate_rg_issuer: 'Emissor do RG',
  nationality: 'Nacionalidade',
  marital_status: 'Estado Civil',
  email: 'Email',
  street: 'Rua',
  street_number: 'Numero',
  city: 'Cidade',
  neighborhood: 'Bairro',
  state: 'Estado',
  cep: 'CEP',
  current_date: 'Data atual',
  association_name: 'Nome da associação',
  association_full_name: 'Nome completo da associação',
  association_city: 'Cidade associação',
  association_state: 'Estado associação',
  association_cnpj: 'CNPJ associação',
  association_site: 'Site da associação',
  signature: 'Assinatura',
  user_code: 'USERCODE',
};

function fullName(row) {
  if (!row) return '';
  return [row.associate_name, row.associate_last_name].filter(Boolean).join(' ').trim();
}

function formatCurrentDate(date = new Date()) {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function associationDefaults(association = {}) {
  return {
    association_name: association.name || 'Kunk',
    association_full_name: association.fullName || association.name || 'Kunk',
    association_city: association.city || null,
    association_state: association.state || null,
    association_cnpj: association.cnpj || null,
    association_site: association.site || null,
  };
}

const ASSOCIATION_VARIABLE_KEYS = new Set([
  'association_name',
  'association_full_name',
  'association_city',
  'association_state',
  'association_cnpj',
  'association_site',
]);

/** Fictional defaults for template PDF preview (operator may override). */
function sampleVariables(kind = 'self', overrides = {}, { now = new Date(), association = null } = {}) {
  const withPatient = kind === 'with_patient';
  const assoc = associationDefaults(
    association || {
      name: 'Kunk',
      fullName: 'ASSOCIAÇÃO EXEMPLO KUNK',
      city: 'Belo Horizonte',
      state: 'MG',
      cnpj: '00.000.000/0001-00',
      site: 'example.org',
    }
  );
  const base = {
    responsible_full_name: 'Maria Fernanda Oliveira',
    patient_full_name: withPatient ? 'João Pedro Oliveira' : null,
    responsible_cpf: '529.982.247-25',
    patient_cpf: withPatient ? '390.533.447-05' : null,
    responsible_rg: 'MG-12.345.678',
    associate_rg_issuer: 'SSP/MG',
    nationality: 'brasileira',
    marital_status: 'Casada',
    email: 'maria.oliveira@exemplo.test',
    street: 'Rua das Palmeiras',
    street_number: '120',
    city: 'Belo Horizonte',
    neighborhood: 'Savassi',
    state: 'MG',
    cep: '30130-000',
    current_date: formatCurrentDate(now),
    ...assoc,
    signature: null,
    user_code: '11111111-1111-4111-8111-111111111111',
  };

  const merged = { ...base };
  if (overrides && typeof overrides === 'object') {
    for (const key of CANONICAL_VARIABLES) {
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
      const value = overrides[key];
      // Dados da associação vêm do admin; override vazio não apaga o perfil.
      if (ASSOCIATION_VARIABLE_KEYS.has(key) && association) {
        if (value == null || String(value).trim() === '') continue;
      }
      merged[key] = value === '' ? null : value;
    }
  }
  if (!withPatient) {
    merged.patient_full_name = merged.patient_full_name || null;
    merged.patient_cpf = merged.patient_cpf || null;
  }
  return merged;
}

function resolveKind(responsible) {
  if (
    ['another', 'pet'].includes(responsible?.responsible_type) &&
    responsible?.patient_user_code
  ) {
    return 'with_patient';
  }
  return 'self';
}

function resolveVariables(
  responsible,
  patient = null,
  { now = new Date(), associationName = null, association = null } = {}
) {
  const assoc = associationDefaults({
    ...(association || {}),
    name: associationName || association?.name || null,
  });
  return {
    responsible_full_name: fullName(responsible),
    patient_full_name: patient ? fullName(patient) : null,
    responsible_cpf: responsible?.associate_cpf || null,
    patient_cpf: patient?.associate_cpf || null,
    responsible_rg: responsible?.associate_rg || null,
    associate_rg_issuer: responsible?.associate_rg_issuer || null,
    nationality: responsible?.nationality || null,
    marital_status: responsible?.marital_status || null,
    email: responsible?.email_account || null,
    street: responsible?.street || null,
    street_number: responsible?.street_number || null,
    city: responsible?.city || null,
    neighborhood: responsible?.neighborhood || null,
    state: responsible?.state || null,
    cep: responsible?.cep || null,
    current_date: formatCurrentDate(now),
    ...assoc,
    signature: null,
    user_code: responsible?.user_code || null,
  };
}

/** Campos cadastrais exigidos no termo (exceto assinatura/data/código). */
const REQUIRED_VARIABLES_SELF = [
  'responsible_full_name',
  'nationality',
  'marital_status',
  'responsible_rg',
  'associate_rg_issuer',
  'responsible_cpf',
  'email',
  'street',
  'street_number',
  'neighborhood',
  'city',
  'state',
  'cep',
];

const REQUIRED_VARIABLES_WITH_PATIENT = [...REQUIRED_VARIABLES_SELF, 'patient_full_name', 'patient_cpf'];

function missingRequiredVariables(variables, kindOrRequiresPatient = 'self') {
  const needsPatient =
    kindOrRequiresPatient === true ||
    kindOrRequiresPatient === 'with_patient' ||
    (kindOrRequiresPatient &&
      typeof kindOrRequiresPatient === 'object' &&
      Boolean(kindOrRequiresPatient.requires_patient));
  const required = needsPatient ? REQUIRED_VARIABLES_WITH_PATIENT : REQUIRED_VARIABLES_SELF;
  return required.filter((name) => {
    const value = variables?.[name];
    return value == null || String(value).trim() === '';
  });
}

function collectVariableNames(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'variable' || node.type === 'signature') {
    const name = node.attrs?.name;
    if (name) out.add(String(name));
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectVariableNames(child, out);
  }
  return out;
}

function validateContentJson(contentJson) {
  if (!contentJson || contentJson.type !== 'doc') {
    return { ok: false, message: 'content_json deve ser um documento TipTap (type=doc)' };
  }
  const names = [...collectVariableNames(contentJson)];
  const unknown = names.filter((n) => !CANONICAL_VARIABLES.includes(n));
  if (unknown.length) {
    return { ok: false, message: `Variáveis desconhecidas: ${unknown.join(', ')}`, unknown };
  }
  return { ok: true, names };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyVariablesToContent(contentJson, variables) {
  const doc = cloneJson(contentJson);

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'variable') {
      const name = node.attrs?.name;
      const value = variables?.[name];
      node.type = 'text';
      const empty = value == null || value === '';
      // Variáveis da associação não usam underline de formulário.
      node.text = empty
        ? ASSOCIATION_VARIABLE_KEYS.has(String(name || ''))
          ? ''
          : '____________________'
        : String(value);
      node.marks = [{ type: 'bold' }];
      delete node.attrs;
      return;
    }
    if (node.type === 'signature') {
      node._remove = true;
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
      node.content = node.content.filter((child) => !child._remove);
    }
  }

  walk(doc);
  return removeOrphanSignatureLabels(doc);
}

/** Remove paragraphs that only labeled the old {{Assinatura}} / signature node. */
function removeOrphanSignatureLabels(contentJson) {
  const doc = cloneJson(contentJson);
  if (!Array.isArray(doc.content)) return doc;

  doc.content = doc.content.filter((block) => {
    if (block.type !== 'paragraph') return true;
    const text = (block.content || [])
      .map((n) => (n.type === 'text' ? n.text || '' : ''))
      .join('')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!text) return false;
    if (/^assinatura\s*:?\s*_*$/i.test(text)) return false;
    if (/^assinatura\s*:?\s*$/i.test(text)) return false;
    return true;
  });
  return doc;
}

module.exports = {
  CANONICAL_VARIABLES,
  VARIABLE_LABELS,
  ASSOCIATION_VARIABLE_KEYS,
  fullName,
  formatCurrentDate,
  sampleVariables,
  resolveKind,
  resolveVariables,
  collectVariableNames,
  validateContentJson,
  applyVariablesToContent,
  removeOrphanSignatureLabels,
  cloneJson,
  missingRequiredVariables,
  REQUIRED_VARIABLES_SELF,
  REQUIRED_VARIABLES_WITH_PATIENT,
  associationDefaults,
};
