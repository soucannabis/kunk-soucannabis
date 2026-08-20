import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLoader } from '../components/AdminLoader.jsx';

export function CachePage({ api }) {
  const [enabled, setEnabled] = useState(false);
  const [baseline, setBaseline] = useState(false);
  const [size, setSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    const res = await api.getAdminCacheStatus();
    const next = Boolean(res.data?.enabled);
    setEnabled(next);
    setBaseline(next);
    setSize(Number(res.data?.size) || 0);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api.patchAdminCacheStatus({ enabled });
      const next = Boolean(res.data?.enabled);
      setEnabled(next);
      setBaseline(next);
      setSize(Number(res.data?.size) || 0);
      setMessage(
        next
          ? 'Cache operacional habilitado.'
          : 'Cache desabilitado e limpo no servidor.'
      );
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setClearing(true);
    setError('');
    setMessage('');
    try {
      const res = await api.clearAdminCache();
      setSize(Number(res.data?.size) || 0);
      setMessage('Cache do servidor limpo.');
    } catch (err) {
      setError(err.message || 'Falha ao limpar');
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <AdminLoader label="Carregando cache…" />;

  return (
    <form
      onSubmit={onSubmit}
      className="card"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: 640,
        width: '100%',
      }}
    >
      <div>
        <p className="muted" style={{ margin: '0 0 0.5rem' }}>
          <Link to="/armazenamento">← Configurações do sistema</Link>
        </p>
        <h2 style={{ marginTop: 0 }}>Cache operacional</h2>
        <p className="muted" style={{ margin: 0 }}>
          Controla o memoryCache do servidor (tags, catálogo de produtos local e remoto,
          atendentes da triagem). Com o cache ligado, listagens estáveis usam TTL.
          Desligar limpa imediatamente o cache do servidor; os apps Kunk passam a buscar dados
          frescos. No Kunk, clicar no logo da sidebar também limpa o cache.
        </p>
      </div>
      {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}
      {message ? (
        <p style={{ color: 'var(--admin-success, #2e7d32)', margin: 0 }}>{message}</p>
      ) : null}
      <label
        className={`ext-flag${enabled ? ' ext-flag--active' : ''}`}
        data-testid="cache-enabled-toggle"
        style={{ maxWidth: '100%' }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="ext-flag-body">
          <strong>Habilitar cache operacional</strong>
          <span className="muted">Default desligado. Entradas em memória agora: {size}</span>
        </span>
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={saving || enabled === baseline}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn" onClick={onClear} disabled={clearing}>
          {clearing ? 'Limpando…' : 'Limpar cache agora'}
        </button>
      </div>
    </form>
  );
}
