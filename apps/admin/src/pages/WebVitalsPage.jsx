import React, { useCallback, useEffect, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { RefreshIcon } from '../components/RefreshIcon.jsx';

const METRIC_LABELS = {
  LCP: 'LCP',
  INP: 'INP',
  CLS: 'CLS',
  FCP: 'FCP',
  TTFB: 'TTFB',
};

const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000, unit: 'ms' },
  INP: { good: 200, poor: 500, unit: 'ms' },
  CLS: { good: 0.1, poor: 0.25, unit: '' },
  FCP: { good: 1800, poor: 3000, unit: 'ms' },
  TTFB: { good: 800, poor: 1800, unit: 'ms' },
};

function formatValue(name, value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (name === 'CLS') return Number(value).toFixed(3);
  if (value >= 1000 && name !== 'CLS') return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function ratingFor(name, p75) {
  const t = THRESHOLDS[name];
  if (!t || p75 == null) return null;
  if (p75 <= t.good) return 'good';
  if (p75 > t.poor) return 'poor';
  return 'needs-improvement';
}

function ratingLabel(rating) {
  if (rating === 'good') return 'Bom';
  if (rating === 'poor') return 'Ruim';
  if (rating === 'needs-improvement') return 'Melhorar';
  return '—';
}

function pct(ratio) {
  if (ratio == null) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function WebVitalsPage({ api }) {
  const [period, setPeriod] = useState('7d');
  const [metricName, setMetricName] = useState('LCP');
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [byPage, setByPage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = `period=${encodeURIComponent(period)}`;
      const [sumRes, seriesRes, pageRes] = await Promise.all([
        api.getWebVitalsSummary(qs),
        api.getWebVitalsSeries(`${qs}&name=${encodeURIComponent(metricName)}`),
        api.getWebVitalsByPage(`${qs}&name=${encodeURIComponent(metricName)}&limit=20`),
      ]);
      setSummary(sumRes.data || null);
      setSeries(seriesRes.data || null);
      setByPage(pageRes.data || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar Web Vitals');
    } finally {
      setLoading(false);
    }
  }, [api, period, metricName]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = summary?.metrics || [];
  const byName = Object.fromEntries(metrics.map((m) => [m.name, m]));

  if (loading && !summary) {
    return <AdminLoader label="Carregando Web Vitals…" />;
  }

  return (
    <div>
      <h1>Web Vitals</h1>
      <p className="muted">
        Métricas de performance dos apps (LCP, INP, CLS, FCP, TTFB). Valores em p75 no período.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar" style={{ marginBottom: '1rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor="wv-period">
          Período{' '}
          <select
            id="wv-period"
            className="input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="24h">24 horas</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
          </select>
        </label>
        <label htmlFor="wv-metric">
          Série / rotas{' '}
          <select
            id="wv-metric"
            className="input"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
          >
            {Object.keys(METRIC_LABELS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          <RefreshIcon />
          Atualizar
        </button>
      </div>

      <div className="errors-summary wv-summary">
        {['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].map((name) => {
          const m = byName[name];
          const rating = ratingFor(name, m?.p75);
          return (
            <div key={name} className="card errors-summary-card">
              <div className="muted">{name}</div>
              <div className="errors-summary-value">{formatValue(name, m?.p75)}</div>
              <div className={`wv-rating wv-rating-${rating || 'na'}`}>
                {ratingLabel(rating)}
                {m?.count != null ? ` · ${m.count} evt` : ''}
                {m?.good_ratio != null ? ` · ${pct(m.good_ratio)} good` : ''}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Série — {metricName} (p75)</h2>
        {loading ? <AdminLoader label="Atualizando…" className="admin-loader--embedded" /> : null}
        {!loading && !(series?.points || []).length ? (
          <p className="muted">Sem dados neste período.</p>
        ) : null}
        {(series?.points || []).length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Bucket ({series.bucket})</th>
                  <th>p75</th>
                  <th>Eventos</th>
                </tr>
              </thead>
              <tbody>
                {series.points.map((p) => (
                  <tr key={String(p.bucket)}>
                    <td className="muted">
                      {p.bucket ? new Date(p.bucket).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td>{formatValue(metricName, p.p75)}</td>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card table-wrap">
        <h2 style={{ marginTop: 0 }}>Piores rotas — {metricName}</h2>
        {!loading && !byPage.length ? (
          <p className="muted">Nenhuma rota com dados.</p>
        ) : null}
        {byPage.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>Path</th>
                <th>p75</th>
                <th>Eventos</th>
                <th>% good</th>
              </tr>
            </thead>
            <tbody>
              {byPage.map((row) => (
                <tr key={row.path}>
                  <td className="mono">{row.path}</td>
                  <td>{formatValue(metricName, row.p75)}</td>
                  <td>{row.count}</td>
                  <td>{pct(row.good_ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
