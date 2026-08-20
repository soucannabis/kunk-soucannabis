import React, { useCallback, useEffect, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { RefreshIcon } from '../components/RefreshIcon.jsx';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

function shortHash(hash) {
  if (!hash) return '—';
  return `${String(hash).slice(0, 10)}…`;
}

export function SystemErrorsPage({ api }) {
  const [summary, setSummary] = useState(null);
  const [groups, setGroups] = useState([]);
  const [period, setPeriod] = useState('30d');
  const [expanded, setExpanded] = useState(null);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyHash, setBusyHash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sumRes, topRes] = await Promise.all([
        api.getSystemErrorsSummary(),
        api.getSystemErrorsTop(`period=${encodeURIComponent(period)}&limit=50`),
      ]);
      setSummary(sumRes.data || null);
      setGroups(topRes.data || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar erros');
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleExpand(hash) {
    if (expanded === hash) {
      setExpanded(null);
      setSamples([]);
      return;
    }
    setExpanded(hash);
    setSamples([]);
    try {
      const res = await api.getSystemErrorSamples(hash, 'limit=5');
      setSamples(res.data || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar amostras');
    }
  }

  async function resolveGroup(hash, status) {
    setBusyHash(hash);
    setError('');
    try {
      await api.resolveSystemError({ error_hash: hash, status });
      if (expanded === hash) {
        setExpanded(null);
        setSamples([]);
      }
      await load();
    } catch (err) {
      setError(err.message || 'Falha ao resolver');
    } finally {
      setBusyHash(null);
    }
  }

  if (loading && !summary) {
    return <AdminLoader label="Carregando erros…" />;
  }

  return (
    <div>
      <h1>Erros do sistema</h1>
      <p className="muted">
        Eventos inesperados do backend e dos apps (frontend). Agrupados por hash para triagem.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="errors-summary">
        <div className="card errors-summary-card">
          <div className="muted">Grupos em aberto</div>
          <div className="errors-summary-value">{summary?.open_groups ?? '—'}</div>
        </div>
        <div className="card errors-summary-card">
          <div className="muted">Eventos 24h</div>
          <div className="errors-summary-value">{summary?.events_24h ?? '—'}</div>
        </div>
        <div className="card errors-summary-card">
          <div className="muted">Eventos 7d</div>
          <div className="errors-summary-value">{summary?.events_7d ?? '—'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="errors-period">
          Período{' '}
          <select
            id="errors-period"
            className="input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="24h">24 horas</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="90d">90 dias</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          <RefreshIcon />
          Atualizar
        </button>
      </div>

      <div className="card table-wrap">
        {loading ? <AdminLoader label="Atualizando…" className="admin-loader--embedded" /> : null}
        {!loading && !groups.length ? (
          <p className="muted">Nenhum grupo de erro em aberto neste período.</p>
        ) : null}
        {groups.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>Mensagem</th>
                <th>Source</th>
                <th>App</th>
                <th>Qtd</th>
                <th>Último</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g.error_hash}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => void toggleExpand(g.error_hash)}
                        title={g.error_hash}
                      >
                        {g.message || shortHash(g.error_hash)}
                      </button>
                      <div className="mono muted" style={{ fontSize: '0.75rem' }}>
                        {shortHash(g.error_hash)}
                        {g.code ? ` · ${g.code}` : ''}
                      </div>
                    </td>
                    <td>{g.source || '—'}</td>
                    <td>{g.app || '—'}</td>
                    <td>{g.count}</td>
                    <td className="muted">{formatDate(g.last_seen)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyHash === g.error_hash}
                        onClick={() => void resolveGroup(g.error_hash, 'fixed')}
                      >
                        Resolvido
                      </button>{' '}
                      <button
                        type="button"
                        className="btn"
                        disabled={busyHash === g.error_hash}
                        onClick={() => void resolveGroup(g.error_hash, 'ignored')}
                      >
                        Ignorar
                      </button>
                    </td>
                  </tr>
                  {expanded === g.error_hash ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="errors-samples">
                          <strong>Amostras</strong>
                          {!samples.length ? (
                            <p className="muted">Sem amostras.</p>
                          ) : (
                            samples.map((s) => (
                              <div key={s.id} className="errors-sample">
                                <div className="muted">
                                  {formatDate(s.date_created)}
                                  {s.url ? ` · ${s.url}` : ''}
                                  {s.method ? ` · ${s.method}` : ''}
                                </div>
                                {s.stack_trace ? (
                                  <pre className="errors-stack">{s.stack_trace}</pre>
                                ) : (
                                  <p className="muted">Sem stack</p>
                                )}
                                {s.user_agent ? (
                                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                                    {s.user_agent}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
