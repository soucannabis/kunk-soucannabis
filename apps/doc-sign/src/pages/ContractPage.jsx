import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventActionLabel, formatValue, kindLabel, statusLabel, variableLabel } from '../labels.js';

const FIELD_BLOCKS = [
  {
    id: 'identity',
    title: 'Identificação',
    keys: ['responsible_full_name', 'responsible_cpf', 'responsible_rg', 'associate_rg_issuer'],
  },
  {
    id: 'personal',
    title: 'Dados pessoais',
    keys: ['nationality', 'marital_status', 'email'],
  },
  {
    id: 'address',
    title: 'Endereço',
    keys: ['street', 'street_number', 'neighborhood', 'city', 'state', 'cep'],
  },
  {
    id: 'patient',
    title: 'Paciente',
    keys: ['patient_full_name', 'patient_cpf'],
    onlyWithPatient: true,
  },
];

export function ContractPage({ api }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.get(`/doc-sign/contracts/${id}`);
        setData(c.data);
        try {
          const a = await api.get(`/doc-sign/contracts/${id}/audit`);
          setAudit(a.data);
        } catch {
          /* ignore */
        }
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [api, id]);

  const vars = data?.variables || {};
  const fullName = data?.associate_full_name || vars.responsible_full_name || '—';
  const visibleBlocks = useMemo(
    () => FIELD_BLOCKS.filter((block) => !block.onlyWithPatient || data?.kind === 'with_patient'),
    [data?.kind]
  );

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function downloadTerm() {
    const url =
      data.status === 'completed'
        ? data.signed_pdf_url || data.filled_pdf_url
        : data.filled_pdf_url || data.signed_pdf_url;
    if (!url) {
      showToast('PDF do termo ainda não disponível.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <p>
        <Link to="/termos">← Termos</Link>
      </p>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>
            {data.title || data.kind_display_name || kindLabel(data.kind)}
          </h1>
          <p style={{ margin: 0 }}>
            <span className={`status-pill status-${data.status}`}>{statusLabel(data.status)}</span>
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={downloadTerm}>
            Baixar termo
          </button>
          <Link className="btn" to={`/termos/${id}/audit`}>
            Histórico completo
          </Link>
        </div>
      </div>

      {toast && <div className="alert">{toast}</div>}

      <div className="card">
        <p style={{ marginTop: 0 }}>
          <strong>{fullName}</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          {data.signer_email || '—'}
        </p>
      </div>

      <div className="var-blocks">
        {visibleBlocks.map((block) => (
          <div className="card var-block" key={block.id}>
            <h3>{block.title}</h3>
            <dl>
              {block.keys.map((key) => (
                <div key={key} className="var-row">
                  <dt>{variableLabel(key)}</dt>
                  <dd>{formatValue(vars[key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {audit?.events?.length ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Linha do tempo</h2>
          <ol className="event-timeline">
            {audit.events.map((e) => (
              <li key={e.id || `${e.event_type}-${e.occurred_at}`}>
                <div className="event-title">{eventActionLabel(e)}</div>
                <div className="muted event-meta">
                  {e.occurred_at ? new Date(e.occurred_at).toLocaleString('pt-BR') : '—'}
                  {e.actor_name || e.actor_email ? ` · ${e.actor_name || e.actor_email}` : ''}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
