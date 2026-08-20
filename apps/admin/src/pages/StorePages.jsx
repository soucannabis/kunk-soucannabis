import React, { useEffect, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';

export function StoreOrderStatusesPage({ api }) {
  const [statuses, setStatuses] = useState(null);
  const [itemsByKey, setItemsByKey] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { loadOrderStatusesConfig } = await import('../lib/orderStatusesConfig.js');
        const res = await loadOrderStatusesConfig(api);
        if (cancelled) return;
        setStatuses(res.statuses);
        setItemsByKey(res.itemsByKey);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function updateStatus(id, patch) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStatus() {
    const id = `st_${Date.now().toString(36)}`;
    setStatuses((prev) => [
      ...prev,
      {
        id,
        value: 'Novo status',
        label: 'Novo status',
        order: (prev.length + 1) * 10,
        system: false,
        color: '#5c6bc0',
      },
    ]);
  }

  function removeStatus(id) {
    const target = statuses.find((s) => s.id === id);
    if (target?.system) {
      setError('Status de sistema não pode ser removido');
      return;
    }
    setStatuses((prev) => prev.filter((s) => s.id !== id));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const awaiting = statuses.filter((s) => s.is_awaiting);
    const paid = statuses.filter((s) => s.is_paid);
    if (awaiting.length !== 1 || paid.length !== 1) {
      setError('Deve haver exatamente um status "aguardando" e um "pago" (sistema)');
      return;
    }
    if (statuses.some((s) => !String(s.label || '').trim())) {
      setError('Todos os status precisam de um nome');
      return;
    }
    setSaving(true);
    try {
      const { saveOrderStatusesConfig } = await import('../lib/orderStatusesConfig.js');
      const next = await saveOrderStatusesConfig(api, statuses, itemsByKey);
      setStatuses(next);
      const reloaded = await (await import('../lib/orderStatusesConfig.js')).loadOrderStatusesConfig(api);
      setItemsByKey(reloaded.itemsByKey);
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !statuses) {
    if (error) return <div className="alert alert-error">{error}</div>;
    return <AdminLoader label="Carregando status…" />;
  }

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Status dos pedidos</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Os dois status de sistema (Aguardando pagamento / Pagamento concluído) controlam o toggle de
            pagamento e a data de pagamento. Você pode adicionar outros para filtros e ações em massa.
          </p>
        </div>
        <button type="button" className="btn" onClick={addStatus} data-testid="add-order-status">
          Adicionar status
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="card"
        style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}
        data-testid="order-statuses-form"
      >
        {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}
        <table className="data">
          <thead>
            <tr>
              <th>Nome / valor</th>
              <th>Cor</th>
              <th>Ordem</th>
              <th>Sistema</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {statuses
              .slice()
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="text"
                      value={s.label || ''}
                      disabled={s.system}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateStatus(s.id, { label, value: s.system ? s.value : label });
                      }}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{3,8}$/.test(String(s.color || '')) ? s.color : '#5c6bc0'}
                      onChange={(e) => updateStatus(s.id, { color: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={s.order ?? 0}
                      onChange={(e) => updateStatus(s.id, { order: Number(e.target.value) || 0 })}
                      style={{ width: 72 }}
                    />
                  </td>
                  <td>{s.system ? 'sim' : '—'}</td>
                  <td>
                    {!s.system && (
                      <button type="button" className="btn" onClick={() => removeStatus(s.id)}>
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="save-order-statuses"
          disabled={saving}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </div>
  );
}
