import { isValidCep, isValidCpf } from '@kunk/forms';

/** Labels em português para exibir em alertas de validação. */
export const FIELD_LABELS_PT = {
  responsible_type: 'Tipo de cadastro',
  associate_name: 'Nome',
  associate_last_name: 'Sobrenome',
  associate_birth_date: 'Nascimento',
  gender: 'Gênero',
  nationality: 'Nacionalidade',
  associate_cpf: 'CPF',
  associate_rg: 'RG',
  associate_rg_issuer: 'Órgão emissor',
  marital_status: 'Estado civil',
  account_password: 'Senha',
  mobile_number: 'Celular',
  street: 'Rua',
  street_number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  cep: 'CEP',
  reason_treatment_text: 'Descreva o motivo',
  ciap_codes: 'Motivo principal para o tratamento',
  pet_name: 'Nome do pet',
  pet_birth_date: 'Nascimento do pet',
  pet_gender: 'Sexo',
  pet_reason_treatment_text: 'Motivo do tratamento do pet',
  email_account: 'E-mail',
};

export function labelForField(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  return FIELD_LABELS_PT[k] || k;
}

export function labelsForFields(fields) {
  if (!Array.isArray(fields)) return fields ? [labelForField(fields)] : [];
  return fields.map(labelForField).filter(Boolean);
}

function hasDigits(value) {
  return String(value || '').replace(/\D/g, '').length > 0;
}

/**
 * Separa campos vazios de erros de formato (ex.: CPF preenchido porém inválido).
 * @returns {{ message: string, missingLabels: string[] }}
 */
export function buildValidationAlert(invalidKeys, form = {}) {
  const keys = Array.isArray(invalidKeys) ? invalidKeys.filter(Boolean) : [];
  const missing = [];
  const formatErrors = [];

  for (const key of keys) {
    if (key === 'associate_cpf' && hasDigits(form.associate_cpf) && !isValidCpf(form.associate_cpf)) {
      formatErrors.push('CPF inválido');
      continue;
    }
    if (key === 'cep' && hasDigits(form.cep) && !isValidCep(form.cep)) {
      formatErrors.push('CEP inválido');
      continue;
    }
    missing.push(key);
  }

  const missingLabels = labelsForFields(missing);

  if (!missingLabels.length && formatErrors.length) {
    return {
      message: `${formatErrors.join('. ')}.`,
      missingLabels: [],
    };
  }

  if (missingLabels.length) {
    return {
      message: formatErrors.length
        ? `Todos os campos precisam ser preenchidos, ${formatErrors.join('. ')}.`
        : 'Todos os campos precisam ser preenchidos,',
      missingLabels,
    };
  }

  return { message: '', missingLabels: [] };
}
