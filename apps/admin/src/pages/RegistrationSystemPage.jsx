import React, { useEffect, useState } from 'react';
import { REGISTRATION_SYSTEM_DEFAULTS } from '@kunk/config';
import { loadRegistrationSystem, saveRegistrationSystem } from '../lib/registrationSystemConfig.js';
import { AdminLoader } from '../components/AdminLoader.jsx';

function Field({ label, hint, children, style }) {
  return (
    <label className="field" style={style}>
      <span>{label}</span>
      {hint ? <span className="muted" style={{ display: 'block', fontWeight: 400, marginBottom: '0.35rem' }}>{hint}</span> : null}
      {children}
    </label>
  );
}

export function RegistrationSystemPage({ api }) {
  const [form, setForm] = useState({ ...REGISTRATION_SYSTEM_DEFAULTS });
  const [baseline, setBaseline] = useState({ ...REGISTRATION_SYSTEM_DEFAULTS });
  const [itemsByKey, setItemsByKey] = useState({});
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
        const { values, itemsByKey: items } = await loadRegistrationSystem(api);
        if (cancelled) return;
        setForm(values);
        setBaseline(values);
        setItemsByKey(items);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar sistema de cadastro');
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

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextItems = await saveRegistrationSystem(api, form, baseline, itemsByKey);
      setItemsByKey(nextItems);
      setBaseline({ ...form });
      setMessage('Sistema de cadastro salvo.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AdminLoader label="Carregando sistema de cadastro…" />;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sistema de cadastro</h1>
      <p className="muted">
        Textos de boas-vindas e de cadastro concluído, e atalho para solicitação de contato (triagem).
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 640 }}>
        <Field
          label="Texto de boas-vindas"
          hint="Exibido no card da tela /bem-vindo. Deixe em branco para usar o texto padrão."
        >
          <textarea
            rows={8}
            value={form.welcomeText}
            onChange={(e) => setField('welcomeText', e.target.value)}
            placeholder={REGISTRATION_SYSTEM_DEFAULTS.welcomeText}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </Field>

        <Field
          label="Texto de cadastro concluído"
          hint="Exibido na tela /cadastro-concluido após finalizar o funil. Deixe em branco para usar o texto padrão."
        >
          <textarea
            rows={6}
            value={form.completionText}
            onChange={(e) => setField('completionText', e.target.value)}
            placeholder={REGISTRATION_SYSTEM_DEFAULTS.completionText}
            style={{ width: '100%', resize: 'vertical', marginTop: '0.25rem' }}
          />
        </Field>

        <label
          className={`ext-flag${form.showTriageButton ? ' ext-flag--active' : ''}`}
          data-testid="show-triage-button-toggle"
        >
          <input
            type="checkbox"
            checked={Boolean(form.showTriageButton)}
            onChange={(e) => setField('showTriageButton', e.target.checked)}
          />
          <span className="ext-flag-body">
            <strong>Exibir botão da triagem</strong>
            <span className="muted">
              Quando habilitado, mostra o botão “Abrir uma solicitação de contato” na tela de
              cadastro concluído.
            </span>
          </span>
        </label>

        <Field
          label="URL do formulário de contato"
          hint="Caminho ou URL da página de contato no cadastramento (padrão /contato)."
          style={{ marginTop: '1.25rem' }}
        >
          <input
            type="text"
            value={form.triageFormUrl}
            onChange={(e) => setField('triageFormUrl', e.target.value)}
            placeholder={REGISTRATION_SYSTEM_DEFAULTS.triageFormUrl}
            disabled={!form.showTriageButton}
            style={{ width: '100%' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              setForm({ ...REGISTRATION_SYSTEM_DEFAULTS });
              setMessage('');
            }}
          >
            Restaurar padrão
          </button>
        </div>
      </form>
    </div>
  );
}
