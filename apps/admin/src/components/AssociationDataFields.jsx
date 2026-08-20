import React from 'react';
import { CnpjInput, PhoneInput, UF_OPTIONS, onlyDigits } from '@kunk/forms';

export const ASSOCIATION_REQUIRED_FIELDS = [
  { key: 'associationName', label: 'Nome da associação' },
  { key: 'associationFullName', label: 'Nome completo da associação' },
  { key: 'associationEmail', label: 'E-mail' },
  { key: 'associationPhone', label: 'Telefone' },
  { key: 'associationSite', label: 'Site' },
  { key: 'associationCnpj', label: 'CNPJ' },
  { key: 'associationCity', label: 'Cidade' },
  { key: 'associationState', label: 'Estado' },
];

export function validateAssociationForm(form) {
  const missing = [];
  for (const field of ASSOCIATION_REQUIRED_FIELDS) {
    const raw = String(form[field.key] ?? '').trim();
    if (!raw) {
      missing.push(field.label);
      continue;
    }
    if (field.key === 'associationPhone' && onlyDigits(raw).length < 10) {
      missing.push('Telefone (completo)');
    }
    if (field.key === 'associationCnpj' && onlyDigits(raw).length !== 14) {
      missing.push('CNPJ (14 dígitos)');
    }
    if (field.key === 'associationState' && !UF_OPTIONS.includes(raw.toUpperCase())) {
      missing.push('Estado (UF válida)');
    }
  }
  return missing;
}

function Field({ label, children, required, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

/**
 * Shared association identity fields (registration branding).
 * @param {{ form: object, onChange: (key: string, value: string) => void, idPrefix?: string }} props
 */
export function AssociationDataFields({ form, onChange, idPrefix = '' }) {
  const stateValue = String(form.associationState || '').trim().toUpperCase();
  const stateKnown = UF_OPTIONS.includes(stateValue);
  const pid = (name) => (idPrefix ? `${idPrefix}-${name}` : name);

  return (
    <>
      <Field label="Nome da associação" required htmlFor={pid('associationName')}>
        <input
          id={pid('associationName')}
          type="text"
          value={form.associationName}
          onChange={(e) => onChange('associationName', e.target.value)}
          placeholder="Ex.: Minha Associação"
          required
        />
      </Field>

      <Field label="Nome completo da associação" required htmlFor={pid('associationFullName')}>
        <input
          id={pid('associationFullName')}
          type="text"
          value={form.associationFullName}
          onChange={(e) => onChange('associationFullName', e.target.value)}
          placeholder="ASSOCIAÇÃO CANNABIS MEDICINAL"
          required
        />
      </Field>

      <Field label="E-mail" required htmlFor={pid('associationEmail')}>
        <input
          id={pid('associationEmail')}
          type="email"
          value={form.associationEmail}
          onChange={(e) => onChange('associationEmail', e.target.value)}
          placeholder="contato@associacao.org"
          required
        />
      </Field>

      <div className="association-fields-row">
        <Field label="Telefone" required>
          <PhoneInput
            value={form.associationPhone}
            onChange={(value) => onChange('associationPhone', value)}
            inputClass="input admin-phone-control"
            inputProps={{ required: true, id: pid('associationPhone'), 'aria-label': 'Telefone' }}
          />
        </Field>

        <Field label="Site" required htmlFor={pid('associationSite')}>
          <input
            id={pid('associationSite')}
            type="text"
            value={form.associationSite}
            onChange={(e) => onChange('associationSite', e.target.value)}
            placeholder="www.associacao.org"
            required
          />
        </Field>
      </div>

      <Field label="CNPJ" required>
        <CnpjInput
          id={pid('associationCnpj')}
          className="input"
          value={form.associationCnpj}
          onChange={(value) => onChange('associationCnpj', value)}
          required
        />
      </Field>

      <div className="association-fields-row association-fields-row--city-uf">
        <Field label="Cidade" required htmlFor={pid('associationCity')}>
          <input
            id={pid('associationCity')}
            type="text"
            value={form.associationCity}
            onChange={(e) => onChange('associationCity', e.target.value)}
            placeholder="Ex.: Goiânia"
            required
          />
        </Field>

        <Field label="Estado" required htmlFor={pid('associationState')}>
          <select
            id={pid('associationState')}
            value={stateValue}
            onChange={(e) => onChange('associationState', e.target.value)}
            required
          >
            <option value="">UF</option>
            {!stateKnown && stateValue ? (
              <option value={stateValue}>
                {stateValue}
                {' '}
                (atual)
              </option>
            ) : null}
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}
