import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { kindLabel } from '../labels.js';

function NewModelModal({ api, existingKinds, onClose, onCreated }) {
  const [mode, setMode] = useState('self');
  const [displayName, setDisplayName] = useState('');
  const [requiresPatient, setRequiresPatient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const selfExists = existingKinds.includes('self');
  const patientExists = existingKinds.includes('with_patient');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'custom'
          ? {
              mode: 'custom',
              display_name: displayName.trim(),
              requires_patient: requiresPatient,
            }
          : { mode };
      const res = await api.post('/doc-sign/templates', body);
      onCreated?.(res.data);
    } catch (err) {
      setError(err.message || 'Falha ao criar modelo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-model-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="new-model-title" style={{ margin: 0 }}>
            Novo modelo
          </h2>
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
            <legend style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Tipo</legend>
            <label className="radio-row">
              <input
                type="radio"
                name="mode"
                checked={mode === 'self'}
                disabled={selfExists}
                onChange={() => setMode('self')}
              />
              <span>
                Associado
                {selfExists ? <span className="muted"> (já existe)</span> : null}
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="mode"
                checked={mode === 'with_patient'}
                disabled={patientExists}
                onChange={() => setMode('with_patient')}
              />
              <span>
                Associado com paciente
                {patientExists ? <span className="muted"> (já existe)</span> : null}
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" name="mode" checked={mode === 'custom'} onChange={() => setMode('custom')} />
              <span>Novo tipo</span>
            </label>
          </fieldset>

          {mode === 'custom' ? (
            <>
              <div className="field">
                <label htmlFor="model-display-name">Nome do tipo</label>
                <input
                  id="model-display-name"
                  type="text"
                  value={displayName}
                  onChange={(ev) => setDisplayName(ev.target.value)}
                  placeholder="Ex.: Voluntário"
                  required
                />
              </div>
              <label className="radio-row" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={requiresPatient}
                  onChange={(ev) => setRequiresPatient(ev.target.checked)}
                />
                <span>Inclui dados de paciente</span>
              </label>
            </>
          ) : null}

          <div className="card-actions" style={{ marginTop: '0.5rem' }}>
            <span />
            <button type="submit" className="btn btn-primary" disabled={busy || (mode === 'self' && selfExists) || (mode === 'with_patient' && patientExists)}>
              {busy ? 'Criando…' : 'Criar modelo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TemplatesPage({ api }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    api
      .get('/doc-sign/templates')
      .then((res) => setTemplates(res.data || []))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, [api]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Modelos de termo</h1>
          <p className="muted" style={{ margin: 0 }}>
            Edite os modelos e publique para gerar termos.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-novo-termo" onClick={() => setModalOpen(true)}>
          <span className="btn-plus" aria-hidden>
            +
          </span>
          Novo modelo
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid-2">
        {templates.map((t) => (
          <div className="card template-card" key={t.kind}>
            <div className="template-card-body">
              <h2 style={{ marginTop: 0 }}>{t.title || t.display_name || kindLabel(t.kind)}</h2>
              <p className="muted">{t.display_name || kindLabel(t.kind)}</p>
              <p className="muted" style={{ marginBottom: 0 }}>
                {Number(t.contracts_count) === 1
                  ? '1 termo gerado'
                  : `${Number(t.contracts_count) || 0} termos gerados`}
              </p>
            </div>
            <div className="card-actions">
              <p className="template-card-status muted">
                {t.current_version_id ? 'Publicado' : 'Ainda não publicado'}
              </p>
              <Link className="btn btn-primary" to={`/modelos/${t.kind}`}>
                Editar
              </Link>
            </div>
          </div>
        ))}
      </div>

      {modalOpen ? (
        <NewModelModal
          api={api}
          existingKinds={templates.map((t) => t.kind)}
          onClose={() => setModalOpen(false)}
          onCreated={(created) => {
            setModalOpen(false);
            if (created?.kind) navigate(`/modelos/${created.kind}`);
            else load();
          }}
        />
      ) : null}
    </div>
  );
}
