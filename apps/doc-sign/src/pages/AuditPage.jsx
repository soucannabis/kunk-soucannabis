import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventActionLabel, formatValue, kindLabel, statusLabel } from '../labels.js';

export function AuditPage({ api }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.get(`/doc-sign/contracts/${id}`);
        setData(c.data);
        const a = await api.get(`/doc-sign/contracts/${id}/audit`);
        setAudit(a.data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [api, id]);

  const events = audit?.events || [];
  const latest = useMemo(
    () => [...events].reverse().find((e) => e.ip || e.user_agent) || events[events.length - 1],
    [events]
  );

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data || !audit) return <p className="muted">Carregando histórico…</p>;

  return (
    <div>
      <p>
        <Link to={`/termos/${id}`}>← Termo</Link>
      </p>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Histórico de auditoria</h1>
          <p className="muted" style={{ margin: 0 }}>
            {statusLabel(data.status)} · {kindLabel(data.kind)} · {data.signer_email}
          </p>
        </div>
        {data.audit_pdf_url ? (
          <a className="btn btn-primary" href={data.audit_pdf_url} target="_blank" rel="noreferrer">
            Baixar PDF da auditoria
          </a>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Resumo</h2>
        <dl className="session-meta">
          <div className="var-row">
            <dt>ID do termo</dt>
            <dd>
              <code>{data.id}</code>
            </dd>
          </div>
          <div className="var-row">
            <dt>Hash preenchido</dt>
            <dd>
              <code>{formatValue(data.filled_pdf_sha256)}</code>
            </dd>
          </div>
          <div className="var-row">
            <dt>Hash assinado</dt>
            <dd>
              <code>{formatValue(data.signed_pdf_sha256)}</code>
            </dd>
          </div>
          <div className="var-row">
            <dt>IP (último)</dt>
            <dd>{formatValue(latest?.ip)}</dd>
          </div>
          <div className="var-row">
            <dt>Navegador (último)</dt>
            <dd className="ua">{formatValue(latest?.user_agent)}</dd>
          </div>
          <div className="var-row">
            <dt>Fuso horário</dt>
            <dd>{formatValue(latest?.timezone)}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Linha do tempo</h2>
        <ol className="event-timeline">
          {events.map((e) => (
            <li key={e.id || `${e.event_type}-${e.occurred_at}`}>
              <div className="event-title">{eventActionLabel(e)}</div>
              <div className="muted event-meta">
                {e.occurred_at ? new Date(e.occurred_at).toLocaleString('pt-BR') : '—'}
                {e.actor_name || e.actor_email ? ` · ${e.actor_name || e.actor_email}` : ''}
              </div>
              <div className="event-detail muted">
                {[e.ip && `IP ${e.ip}`, e.timezone, e.user_agent].filter(Boolean).join(' · ') || 'Sem metadados extras'}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
