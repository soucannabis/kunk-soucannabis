import React, { useEffect, useState } from 'react';
import { ASSOCIATION_DATA_DEFAULTS, defaultLogoPlacements } from '@kunk/config';
import {
  loadAssociationData,
  loadAssociationLogos,
  saveAssociationData,
  saveAssociationLogoAndTitle,
} from '../lib/associationDataConfig.js';
import {
  AssociationDataFields,
  validateAssociationForm,
} from '../components/AssociationDataFields.jsx';
import { AssociationLogosField } from '../components/AssociationLogosField.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';

export function AssociationDataPage({ api }) {
  const [form, setForm] = useState({ ...ASSOCIATION_DATA_DEFAULTS });
  const [baseline, setBaseline] = useState({ ...ASSOCIATION_DATA_DEFAULTS });
  const [itemsByKey, setItemsByKey] = useState({});
  const [logoSquare, setLogoSquare] = useState('');
  const [logoRectangular, setLogoRectangular] = useState('');
  const [logoPlacements, setLogoPlacements] = useState(() => defaultLogoPlacements());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [{ values, itemsByKey: items }, logos] = await Promise.all([
          loadAssociationData(api),
          loadAssociationLogos(api),
        ]);
        if (cancelled) return;
        setForm(values);
        setBaseline(values);
        setItemsByKey(items);
        setLogoSquare(logos.logoSquare);
        setLogoRectangular(logos.logoRectangular);
        setLogoPlacements(logos.logoPlacements);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar dados da associação');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage('');
  }

  async function persistLogos(next) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await saveAssociationLogoAndTitle(api, {
        logoSquare: next.logoSquare,
        logoRectangular: next.logoRectangular,
        logoPlacements: next.logoPlacements,
        associationName: form.associationName,
      });
      setLogoSquare(result.logoSquare);
      setLogoRectangular(result.logoRectangular);
      setLogoPlacements(result.logoPlacements);
      setMessage('Logos atualizadas.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar logo');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const missing = validateAssociationForm(form);
    if (missing.length) {
      setError(`Preencha todos os campos obrigatórios: ${missing.join(', ')}.`);
      setMessage('');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextItems = await saveAssociationData(api, form, baseline, itemsByKey);
      setItemsByKey(nextItems);
      setBaseline({ ...form });
      const logos = await saveAssociationLogoAndTitle(api, {
        logoSquare,
        logoRectangular,
        logoPlacements,
        associationName: form.associationName,
      });
      setLogoSquare(logos.logoSquare);
      setLogoRectangular(logos.logoRectangular);
      setLogoPlacements(logos.logoPlacements);
      setMessage('Dados da associação salvos.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AdminLoader label="Carregando dados da associação…" />;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dados da associação</h1>
      <p className="muted">
        Identidade jurídica usada no cadastramento, no Kunk e na assinatura de termos. O nome da
        associação é o título do app Kunk. Cadastre o símbolo e a logo completa e configure tipo e
        largura em cada login e menu. Todos os campos de texto são obrigatórios.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="association-data-layout">
        <form className="card association-data-card" onSubmit={onSubmit} noValidate>
          <h2 className="association-data-card-title">Dados cadastrais</h2>
          <AssociationDataFields form={form} onChange={setField} />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>

        <div className="card association-data-card association-data-card--logo">
          <h2 className="association-data-card-title">Logos</h2>
          <AssociationLogosField
            logoSquare={logoSquare}
            logoRectangular={logoRectangular}
            logoPlacements={logoPlacements}
            onPersist={persistLogos}
            api={api}
            onError={setError}
          />
        </div>
      </div>
    </div>
  );
}
