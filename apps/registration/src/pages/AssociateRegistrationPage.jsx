import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssociateAuth } from '@kunk/auth-session';
import {
  Ciap2Select,
  CepInput,
  CpfInput,
  GenderSelect,
  MARITAL_OPTIONS,
  PhoneInput,
  UF_OPTIONS,
  validateAssociateForm,
} from '@kunk/forms';
import { AlertError } from '@kunk/ui';
import { Icon } from '../components/Icon.jsx';
import { buildValidationAlert } from '../lib/fieldLabels.js';

const EMPTY = {
  responsible_type: 'himself',
  associate_name: '',
  associate_last_name: '',
  associate_birth_date: '',
  gender: '',
  nationality: 'Brasileiro(a)',
  associate_cpf: '',
  associate_rg: '',
  associate_rg_issuer: '',
  marital_status: '',
  mobile_number: '',
  street: '',
  street_number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  cep: '',
  reason_treatment_text: '',
  ciap_codes: [],
  pet_name: '',
  pet_birth_date: '',
  pet_gender: '',
  pet_reason_treatment_text: '',
};

function FieldLabel({ children, hint }) {
  return (
    <label className="form-label">
      <span className="form-label-title">{children}</span>
      {hint ? <span className="form-label-hint">{hint}</span> : null}
    </label>
  );
}

export function AssociateRegistrationPage({ api }) {
  const { user, refresh } = useAssociateAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ciap2Enabled, setCiap2Enabled] = useState(true);
  const isPet = form.responsible_type === 'pet';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getCiap2Status();
        if (!cancelled && typeof res.data?.enabled === 'boolean') {
          setCiap2Enabled(res.data.enabled);
        }
      } catch {
        /* default on */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      responsible_type: user.responsible_type || prev.responsible_type,
      associate_name: user.associate_name || '',
      associate_last_name: user.associate_last_name || '',
      associate_birth_date: user.associate_birth_date
        ? String(user.associate_birth_date).slice(0, 10)
        : '',
      gender: user.gender || '',
      nationality: user.nationality || 'Brasileiro(a)',
      associate_cpf: user.associate_cpf || '',
      associate_rg: user.associate_rg || '',
      associate_rg_issuer: user.associate_rg_issuer || '',
      marital_status: user.marital_status || '',
      mobile_number: user.mobile_number || '',
      street: user.street || '',
      street_number: user.street_number || '',
      complement: user.complement || '',
      neighborhood: user.neighborhood || '',
      city: user.city || '',
      state: user.state || '',
      cep: user.cep || '',
      reason_treatment_text: user.reason_treatment_text || '',
      ciap_codes: user.ciap_codes
        ? String(user.ciap_codes).split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        : [],
    }));
    setInvalid(user.invalid_fields || []);
  }, [user]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setInvalid((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Sempre persiste os campos válidos; inválidos vão para invalid_fields (Problema no cadastro).
    // Senha já definida no cadastro de e-mail — não exige de novo neste formulário.
    const localInvalid = validateAssociateForm(
      { ...form, account_password: user?.account_password ? '********' : '' },
      { ciap2Enabled },
    ).filter(
      (k) =>
        k !== 'account_password' &&
        (!isPet || (k !== 'reason_treatment_text' && k !== 'ciap_codes'))
    );
    if (isPet) {
      if (!form.pet_name.trim()) localInvalid.push('pet_name');
      if (!form.pet_birth_date) localInvalid.push('pet_birth_date');
      if (!form.pet_gender) localInvalid.push('pet_gender');
      if (!form.pet_reason_treatment_text.trim()) {
        localInvalid.push('pet_reason_treatment_text');
      }
    }

    const {
      pet_name,
      pet_birth_date,
      pet_gender,
      pet_reason_treatment_text,
      reason_treatment_text,
      ciap_codes,
      ...responsibleFields
    } = form;
    const body = isPet
      ? responsibleFields
      : { ...responsibleFields, reason_treatment_text, ciap_codes };
    try {
      const res = await api.patchMe(body);
      await refresh();
      const inv = (res.meta?.invalid_fields || localInvalid || []).filter((k) => k !== 'account_password');
      setInvalid(inv);
      if (inv.length) {
        const alert = buildValidationAlert(inv, body);
        setError(alert.message || 'Há campos pendentes no cadastro.');
        return;
      }
      if (res.data.responsible_type === 'pet') {
        const patients = await api.listMyPatients();
        const existing = patients.data?.[0];
        const pet = {
          associate_name: pet_name.trim(),
          associate_birth_date: pet_birth_date,
          gender: pet_gender,
          reason_treatment_text: pet_reason_treatment_text.trim(),
        };
        if (existing?.id) await api.patchMyPatient(existing.id, pet);
        else await api.createMyPatient(pet);
        navigate('/cadastro-paciente');
      } else if (res.data.responsible_type === 'another') {
        navigate('/cadastro-paciente');
      } else {
        await api.advance();
        await refresh();
        navigate('/documentos');
      }
    } catch (err) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (name) =>
    `form-control${invalid.includes(name) ? ' is-invalid' : ''}`;

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="form-page-title">Dados do responsável</h1>
      <p className="form-page-hint">
        Informe os dados pessoais e de contato da pessoa responsável pelo cadastro.
        <br />
        Todos os campos são obrigatórios para realizar o cadastro como associado.
      </p>

      <fieldset className="responsible-type">
        <legend className="responsible-type__legend">Tipo de cadastro</legend>
        <p className="responsible-type__hint">
          Escolha se o cadastro é para você, para outra pessoa ou para um pet.
          Isso define quais dados serão solicitados nas próximas etapas.
        </p>
        <div className="responsible-type__options" role="radiogroup" aria-label="Tipo de cadastro">
          {[
            {
              value: 'himself',
              title: 'Para mim',
              desc: 'O responsável é também o paciente.',
            },
            {
              value: 'another',
              title: 'Para outra pessoa',
              desc: 'Cadastro em nome de um paciente.',
            },
            {
              value: 'pet',
              title: 'Para pet',
              desc: 'Atendimento veterinário / animal.',
            },
          ].map((opt) => {
            const selected = form.responsible_type === opt.value;
            const iconName = opt.value === 'himself' ? 'user' : opt.value === 'another' ? 'users' : 'paw';
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`responsible-type__option${selected ? ' is-selected' : ''}`}
                onClick={() => setField('responsible_type', opt.value)}
              >
                <span className="responsible-type__radio" aria-hidden />
                <Icon name={iconName} size={20} className="responsible-type__icon" />
                <span className="responsible-type__text">
                  <span className="responsible-type__title">{opt.title}</span>
                  <span className="responsible-type__desc">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="row g-4 form-fields">
        <div className="col-md-6">
          <FieldLabel hint="como no documento">Nome</FieldLabel>
          <input className={fieldClass('associate_name')} required value={form.associate_name} onChange={(e) => setField('associate_name', e.target.value)} />
        </div>
        <div className="col-md-6">
          <FieldLabel hint="como no documento">Sobrenome</FieldLabel>
          <input className={fieldClass('associate_last_name')} required value={form.associate_last_name} onChange={(e) => setField('associate_last_name', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="data de nascimento">Nascimento</FieldLabel>
          <input type="date" className={fieldClass('associate_birth_date')} required value={form.associate_birth_date} onChange={(e) => setField('associate_birth_date', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="identidade de gênero">Gênero</FieldLabel>
          <GenderSelect
            required
            className={fieldClass('gender')}
            value={form.gender}
            onChange={(v) => setField('gender', v)}
          />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="país de origem">Nacionalidade</FieldLabel>
          <input className={fieldClass('nationality')} required value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="apenas números">CPF</FieldLabel>
          <CpfInput className={fieldClass('associate_cpf')} required value={form.associate_cpf} onChange={(v) => setField('associate_cpf', v)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="documento de identidade">RG</FieldLabel>
          <input className={fieldClass('associate_rg')} required value={form.associate_rg} onChange={(e) => setField('associate_rg', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="ex.: SSP/SP">Órgão emissor</FieldLabel>
          <input className={fieldClass('associate_rg_issuer')} required value={form.associate_rg_issuer} onChange={(e) => setField('associate_rg_issuer', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="situação conjugal">Estado civil</FieldLabel>
          <select className={fieldClass('marital_status')} required value={form.marital_status} onChange={(e) => setField('marital_status', e.target.value)}>
            <option value="">Selecione</option>
            {MARITAL_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="col-md-8">
          <FieldLabel hint="com DDI do país">Celular</FieldLabel>
          <PhoneInput
            value={form.mobile_number}
            onChange={(v) => setField('mobile_number', v)}
            invalid={invalid.includes('mobile_number')}
            inputProps={{ required: true }}
          />
        </div>
        <div className="col-md-8">
          <FieldLabel hint="logradouro do endereço">Rua</FieldLabel>
          <input className={fieldClass('street')} required value={form.street} onChange={(e) => setField('street', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="número do imóvel">Número</FieldLabel>
          <input className={fieldClass('street_number')} required value={form.street_number} onChange={(e) => setField('street_number', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="apto, bloco… (opcional)">Complemento</FieldLabel>
          <input className="form-control" value={form.complement} onChange={(e) => setField('complement', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="bairro do endereço">Bairro</FieldLabel>
          <input className={fieldClass('neighborhood')} required value={form.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} />
        </div>
        <div className="col-md-4">
          <FieldLabel hint="cidade de residência">Cidade</FieldLabel>
          <input className={fieldClass('city')} required value={form.city} onChange={(e) => setField('city', e.target.value)} />
        </div>
        <div className="col-md-2">
          <FieldLabel hint="estado">UF</FieldLabel>
          <select className={fieldClass('state')} required value={form.state} onChange={(e) => setField('state', e.target.value)}>
            <option value="">UF</option>
            {UF_OPTIONS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>
        <div className="col-md-4">
          <FieldLabel hint="o código CEP do seu endereço">CEP</FieldLabel>
          <CepInput className={fieldClass('cep')} required value={form.cep} onChange={(v) => setField('cep', v)} />
        </div>
      </div>

      {!isPet && ciap2Enabled ? (
        <section className="ciap2-block">
          <h2 className="ciap2-block-title">Motivo principal para o tratamento</h2>
          <p className="ciap2-help">
            Os dados deste campo são de acordo com o CIAP2 (Classificação
            Internacional de Atenção Primária)
            {' '}
            <a
              className="ciap2-help-link"
              href="https://saude.campinas.sp.gov.br/sistemas/esus/guia_CIAP2.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Saiba Mais
            </a>
          </p>
          <p className="ciap2-help">
            No campo abaixo, pesquise pelo motivo do tratamento e selecione
            uma ou mais opções.
          </p>
          <p className="ciap2-block-count">
            {(form.ciap_codes || []).length}/10 motivos
          </p>
          <Ciap2Select
            hideCount
            invalid={invalid.includes('ciap_codes')}
            value={form.ciap_codes}
            onChange={(v) => setField('ciap_codes', v)}
          />
        </section>
      ) : null}

      {isPet ? (
        <section className="form-section">
          <h2 className="ciap2-block-title">Dados do pet</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <FieldLabel hint="nome do paciente pet">Nome do pet</FieldLabel>
              <input
                className={fieldClass('pet_name')}
                required
                value={form.pet_name}
                onChange={(e) => setField('pet_name', e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <FieldLabel hint="data de nascimento">Nascimento do pet</FieldLabel>
              <input
                type="date"
                className={fieldClass('pet_birth_date')}
                required
                value={form.pet_birth_date}
                onChange={(e) => setField('pet_birth_date', e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <FieldLabel hint="macho ou fêmea">Sexo</FieldLabel>
              <select
                className={fieldClass('pet_gender')}
                required
                value={form.pet_gender}
                onChange={(e) => setField('pet_gender', e.target.value)}
              >
                <option value="">Selecione</option>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <FieldLabel hint="informe com suas palavras">
              Descreva com suas palavras o motivo do tratamento
            </FieldLabel>
            <textarea
              className={fieldClass('pet_reason_treatment_text')}
              required
              rows={3}
              value={form.pet_reason_treatment_text}
              onChange={(e) => setField('pet_reason_treatment_text', e.target.value)}
            />
          </div>
        </section>
      ) : (
        <div className="form-section">
          <FieldLabel hint="informe com suas palavras">
            Descreva com suas palavras o motivo do seu tratamento
          </FieldLabel>
          <textarea className={fieldClass('reason_treatment_text')} required rows={3} value={form.reason_treatment_text} onChange={(e) => setField('reason_treatment_text', e.target.value)} />
        </div>
      )}

      <AlertError
        className="mt-4"
        message={error}
        emptyFields={invalid.length ? buildValidationAlert(invalid, form).missingLabels : []}
      />

      <button className="btn btn-success mt-3 btn-with-icon" type="submit" disabled={busy}>
        <Icon name="save" size={18} />
        Salvar e continuar
      </button>
    </form>
  );
}
