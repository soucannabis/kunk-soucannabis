import React, { useCallback, useEffect, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { RefreshIcon } from '../components/RefreshIcon.jsx';

function StatusDot({ online }) {
  return (
    <span
      className={`home-status-dot ${online ? 'home-status-dot--online' : 'home-status-dot--offline'}`}
      aria-hidden="true"
    />
  );
}

export function HomePage({ api }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(
    async ({ soft = false } = {}) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const res = await api.getSystemHealth();
        setData(res.data || null);
      } catch (err) {
        setError(err.message || 'Falha ao consultar status dos serviços');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api]
  );

  useEffect(() => {
    load();
    const id = window.setInterval(() => load({ soft: true }), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return <AdminLoader label="Carregando status dos serviços…" />;
  }

  const services = data?.services || [];

  return (
    <div className="home-page" data-testid="admin-home">
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Home</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            URLs dos serviços da instalação e status via rota <code>/health</code>.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => load({ soft: true })}
          disabled={refreshing}
          data-testid="home-refresh"
        >
          <RefreshIcon />
          {refreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <p className="muted" style={{ marginBottom: '1rem' }}>
          {data.online_count}/{data.total} online
          {data.checked_at
            ? ` · verificado às ${new Date(data.checked_at).toLocaleTimeString('pt-BR')}`
            : ''}
        </p>
      ) : null}

      <div className="home-services-grid">
        {services.map((svc) => (
          <article
            key={svc.id}
            className="card home-service-card"
            data-testid={`home-service-${svc.id}`}
            data-online={svc.online ? '1' : '0'}
          >
            <div className="home-service-card__head">
              <StatusDot online={svc.online} />
              <h2>{svc.label}</h2>
              <span
                className={`home-service-badge ${svc.online ? 'home-service-badge--online' : 'home-service-badge--offline'}`}
              >
                {svc.online ? 'Online' : 'Offline'}
              </span>
            </div>
            <a
              className="home-service-url"
              href={svc.url}
              target="_blank"
              rel="noreferrer"
              title={svc.url}
            >
              {svc.url}
            </a>
            <p className="muted home-service-meta">
              Health: {svc.health_url}
              {svc.latency_ms != null ? ` · ${svc.latency_ms} ms` : ''}
              {!svc.online && svc.error ? ` · ${svc.error}` : ''}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
