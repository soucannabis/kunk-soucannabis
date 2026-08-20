import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssociateAuth } from '@kunk/auth-session';
import { Ciap2Select, CpfInput, GenderSelect } from '@kunk/forms';
import { AlertError } from '@kunk/ui';
import { Icon } from '../components/Icon.jsx';
import { buildValidationAlert } from '../lib/fieldLabels.js';

const EMPTY = {
  associate_name: '',
  associate_last_name: '',
  associate_birth_date: '',
  gender: '',
  nationality: 'Brasileiro(a)',
  associate_cpf: '',
  associate_rg: '',
  associate_rg_issuer: '',
  reason_treatment_text: '',
  ciap_codes: [],
};

export function PatientRegistrationPage({ api }) {
  const { user, refresh } = useAssociateAuth();
  const navigate = useNavigate();
  const isPet = user?.responsible_type === 'pet';
  const [form, setForm] = useState(EMPTY);
  const [patientId, setPatientId] = useState(null);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ciap2Enabled, setCiap2Enabled] = useState(true);

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
    if (!['another', 'pet'].includes(user?.responsible_type)) {
      navigate('/cadastro-associado');
      return;
    }
    (async () => {
      const res = await api.listMyPatients();
      const p = res.data?.[0];
      if (p) {
        setPatientId(p.id);
        setForm({
          associate_name: p.associate_name || '',
          associate_last_name: p.associate_last_name || '',
          associate_birth_date: p.associate_birth_date ? String(p.associate_birth_date).slice(0, 10) : '',
          gender: p.gender || '',
          nationality: p.nationality || 'Brasileiro(a)',
          associate_cpf: p.associate_cpf || '',
          associate_rg: p.associate_rg || '',
          associate_rg_issuer: p.associate_rg_issuer || '',
          reason_treatment_text: p.reason_treatment_text || '',
          ciap_codes: p.ciap_codes
            ? String(p.ciap_codes).split(/[;,]/).map((s) => s.trim()).filter(Boolean)
            : [],
        });
        setInvalid(p.invalid_fields || []);
      }
    })().catch((err) => setError(err.message));
  }, [user, api, navigate]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setInvalid((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Sempre persiste campos válidos; inválidos ficam em invalid_fields (Problema no cadastro).
      let res;
      const body = isPet
        ? {
            associate_name: form.associate_name,
            associate_birth_date: form.associate_birth_date,
            gender: form.gender,
            reason_treatment_text: form.reason_treatment_text,
          }
        : form;
      if (patientId) res = await api.patchMyPatient(patientId, body);
      else res = await api.createMyPatient(body);
      setPatientId(res.data.id);
      const inv = res.meta?.invalid_fields || [];
      setInvalid(inv);
      await refresh();
      if (inv.length) {
        const alert = buildValidationAlert(inv, form);
        setError(alert.message || 'Há campos pendentes no cadastro.');
        return;
      }
      await api.advance();
      await refresh();
      navigate('/documentos');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (name) => `form-control${invalid.includes(name) ? ' is-invalid' : ''}`;

  return (
    <form onSubmit={onSubmit}>
      <h1 className="h3 mb-3">{isPet ? 'Dados do paciente pet' : 'Dados do paciente'}</h1>
      {isPet ? (
        <>
          <p className="form-page-hint">
            Confira os dados do pet antes de continuar o cadastro.
          </p>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label">Nome do pet</label>
              <input className={fieldClass('associate_name')} value={form.associate_name} onChange={(e) => setField('associate_name', e.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Nascimento do pet</label>
              <input type="date" className={fieldClass('associate_birth_date')} value={form.associate_birth_date} onChange={(e) => setField('associate_birth_date', e.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Sexo</label>
              <select className={fieldClass('gender')} value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                <option value="">Selecione</option>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="form-label">Motivo do tratamento</label>
            <textarea className={fieldClass('reason_treatment_text')} rows={3} value={form.reason_treatment_text} onChange={(e) => setField('reason_treatment_text', e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="row g-2">
            <div className="col-md-6">
          <label className="form-label">Nome</label>
          <input className={fieldClass('associate_name')} value={form.associate_name} onChange={(e) => setField('associate_name', e.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label">Sobrenome</label>
          <input className={fieldClass('associate_last_name')} value={form.associate_last_name} onChange={(e) => setField('associate_last_name', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Nascimento</label>
          <input type="date" className={fieldClass('associate_birth_date')} value={form.associate_birth_date} onChange={(e) => setField('associate_birth_date', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Gênero</label>
          <GenderSelect value={form.gender} onChange={(v) => setField('gender', v)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Nacionalidade</label>
          <input className={fieldClass('nationality')} value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">CPF</label>
          <CpfInput className={fieldClass('associate_cpf')} value={form.associate_cpf} onChange={(v) => setField('associate_cpf', v)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">RG</label>
          <input className={fieldClass('associate_rg')} value={form.associate_rg} onChange={(e) => setField('associate_rg', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Órgão emissor</label>
          <input className={fieldClass('associate_rg_issuer')} value={form.associate_rg_issuer} onChange={(e) => setField('associate_rg_issuer', e.target.value)} />
        </div>
          </div>
          <div className="mt-3">
            {ciap2Enabled ? (
              <>
                <label className="form-label">CIAP-2</label>
                <Ciap2Select value={form.ciap_codes} onChange={(v) => setField('ciap_codes', v)} />
              </>
            ) : null}
          </div>
          <div className="mt-3">
            <label className="form-label">Motivo</label>
            <textarea className={fieldClass('reason_treatment_text')} rows={3} value={form.reason_treatment_text} onChange={(e) => setField('reason_treatment_text', e.target.value)} />
          </div>
        </>
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
