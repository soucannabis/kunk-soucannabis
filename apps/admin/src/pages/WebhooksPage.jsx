import React, { useCallback, useEffect, useState } from 'react';
import {
  WEBHOOK_ACTIONS,
  WEBHOOK_TABLE_LABELS,
  WEBHOOK_TABLES,
} from '@kunk/config';
import { AdminLoader } from '../components/AdminLoader.jsx';

function emptyTableSet() {
  return Object.fromEntries(WEBHOOK_TABLES.map((t) => [t, false]));
}

function emptyActionSet() {
  return Object.fromEntries(WEBHOOK_ACTIONS.map((a) => [a.key, false]));
}

function tablesFromEndpoint(endpoint) {
  const set = emptyTableSet();
  for (const t of endpoint?.tables || []) {
    if (t in set) set[t] = true;
  }
  return set;
}

function actionsFromEndpoint(endpoint) {
  const set = emptyActionSet();
  for (const a of endpoint?.actions || []) {
    if (a in set) set[a] = true;
  }
  return set;
}

function selectedKeys(map) {
  return Object.entries(map)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

function SecretRevealModal({ secret, name, onClose }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="webhook-secret-title">
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <h2 id="webhook-secret-title" style={{ marginTop: 0 }}>
          Secret do webhook
        </h2>
        <p className="muted">
          Copie o secret agora. Ele assina os POSTs (header <code>X-Kunk-Signature</code>) e não será
          exibido novamente após fechar.
        </p>
        {name ? (
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong>Webhook:</strong> {name}
          </p>
        ) : null}
        <code className="api-token-secret" data-testid="webhook-secret-plaintext">
          {secret}
        </code>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={onCopy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} data-testid="webhook-secret-close">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTables(tables) {
  if (!tables?.length) return '—';
  return tables.map((t) => WEBHOOK_TABLE_LABELS[t] || t).join(', ');
}

function formatActions(actions) {
  if (!actions?.length) return '—';
  const labels = Object.fromEntries(WEBHOOK_ACTIONS.map((a) => [a.key, a.label]));
  return actions.map((a) => labels[a] || a).join(', ');
}

function IconSvg({ children, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function EditIcon() {
  return (
    <IconSvg>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </IconSvg>
  );
}

function TestIcon() {
  return (
    <IconSvg>
      <path d="M5 5h14" />
      <path d="M6 5v6.5a6 6 0 0 0 12 0V5" />
      <path d="M9 11h6" />
    </IconSvg>
  );
}

function DeliveriesIcon() {
  return (
    <IconSvg>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </IconSvg>
  );
}

function SecretIcon() {
  return (
    <IconSvg>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="m11 12 9-9" />
      <path d="m16 3 2 2" />
      <path d="m19 6 2 2" />
    </IconSvg>
  );
}

function DeleteIcon() {
  return (
    <IconSvg>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </IconSvg>
  );
}

function SpinnerIcon() {
  return (
    <IconSvg>
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </IconSvg>
  );
}

export function WebhooksPage({ api }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [tableSet, setTableSet] = useState(() => emptyTableSet());
  const [actionSet, setActionSet] = useState(() => emptyActionSet());
  const [revealed, setRevealed] = useState(null);
  const [deliveriesFor, setDeliveriesFor] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testingId, setTestingId] = useState(null);

  const refresh = useCallback(async () => {
    const res = await api.listWebhooks();
    setItems(Array.isArray(res.data) ? res.data : []);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar webhooks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setUrl('');
    setEnabled(true);
    setTableSet(emptyTableSet());
    setActionSet(emptyActionSet());
  }

  function startEdit(item) {
    setEditingId(item.id);
    setName(item.name || '');
    setUrl(item.url || '');
    setEnabled(Boolean(item.enabled));
    setTableSet(tablesFromEndpoint(item));
    setActionSet(actionsFromEndpoint(item));
    setMessage('');
    setError('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    const tables = selectedKeys(tableSet);
    const actions = selectedKeys(actionSet);
    if (!name.trim()) {
      setError('Informe um nome.');
      return;
    }
    if (!url.trim()) {
      setError('Informe a URL.');
      return;
    }
    if (!tables.length || !actions.length) {
      setError('Selecione ao menos uma tabela e uma ação.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await api.updateWebhook(editingId, {
          name: name.trim(),
          url: url.trim(),
          tables,
          actions,
          enabled,
        });
        setMessage('Webhook atualizado.');
        resetForm();
      } else {
        const res = await api.createWebhook({
          name: name.trim(),
          url: url.trim(),
          tables,
          actions,
          enabled,
        });
        setRevealed({
          secret: res.data?.secret,
          name: res.data?.endpoint?.name || name.trim(),
        });
        resetForm();
      }
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao salvar webhook');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm('Excluir este webhook e o histórico de execuções?')) return;
    setError('');
    setMessage('');
    try {
      await api.deleteWebhook(id);
      if (editingId === id) resetForm();
      if (deliveriesFor === id) {
        setDeliveriesFor(null);
        setDeliveries([]);
      }
      setMessage('Webhook excluído.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao excluir');
    }
  }

  async function onRotate(id, itemName) {
    if (!window.confirm('Gerar um novo secret? O secret anterior deixa de valer imediatamente.')) return;
    setError('');
    setMessage('');
    try {
      const res = await api.rotateWebhookSecret(id);
      setRevealed({
        secret: res.data?.secret,
        name: res.data?.endpoint?.name || itemName,
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'Falha ao rotacionar secret');
    }
  }

  async function onTest(id) {
    setError('');
    setMessage('');
    setTestingId(id);
    try {
      const res = await api.testWebhook(id);
      setMessage(res.data?.message || 'Teste entregue com sucesso.');
      setDeliveriesFor(id);
      const list = await api.listWebhookDeliveries(id, 'limit=20');
      setDeliveries(Array.isArray(list.data) ? list.data : []);
    } catch (err) {
      const detail = err.details?.delivery?.last_error;
      const msg =
        err.message ||
        (detail ? `Teste falhou: ${detail}` : 'Falha ao testar o webhook');
      setError(msg);
      setDeliveriesFor(id);
      try {
        const list = await api.listWebhookDeliveries(id, 'limit=20');
        setDeliveries(Array.isArray(list.data) ? list.data : []);
      } catch {
        /* ignore */
      }
    } finally {
      setTestingId(null);
    }
  }

  async function onShowDeliveries(id) {
    setError('');
    try {
      if (deliveriesFor === id) {
        setDeliveriesFor(null);
        setDeliveries([]);
        return;
      }
      const res = await api.listWebhookDeliveries(id, 'limit=20');
      setDeliveriesFor(id);
      setDeliveries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar execuções');
    }
  }

  if (loading) return <AdminLoader label="Carregando webhooks…" />;

  return (
    <div className="webhooks-page">
      <h1 style={{ marginTop: 0 }}>Webhooks</h1>
      <p className="muted">
        Envie eventos HTTP para URLs suas quando associados, pedidos, serviços ou triagem forem criados,
        atualizados ou excluídos. A entrega é assíncrona com retries.
      </p>

      <section className="card" style={{ marginBottom: '1.25rem', maxWidth: 720 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Editar webhook' : 'Novo webhook'}</h2>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="webhook-name"
            />
          </label>
          <label className="field">
            <span>URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              data-testid="webhook-url"
            />
          </label>

          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Tabelas
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            {WEBHOOK_TABLES.map((t) => (
              <label key={t} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(tableSet[t])}
                  onChange={(e) => setTableSet((prev) => ({ ...prev, [t]: e.target.checked }))}
                />
                <span>{WEBHOOK_TABLE_LABELS[t] || t}</span>
              </label>
            ))}
          </div>

          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Ações
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            {WEBHOOK_ACTIONS.map((a) => (
              <label key={a.key} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(actionSet[a.key])}
                  onChange={(e) => setActionSet((prev) => ({ ...prev, [a.key]: e.target.checked }))}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>

          <label className="ext-flag" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="ext-flag-body">
              <strong>Ativo</strong>
              <span className="muted">Desative para pausar envios sem excluir a configuração.</span>
            </span>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : editingId ? 'Salvar' : 'Criar'}
            </button>
            {editingId ? (
              <button type="button" className="btn" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {error ? (
        <div className="alert alert-error" data-testid="webhook-feedback-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" data-testid="webhook-feedback-success" style={{ marginBottom: '1rem' }}>
          {message}
        </div>
      ) : null}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Configurados</h2>
        {!items.length ? (
          <p className="muted">Nenhum webhook ainda.</p>
        ) : (
          <table className="table data">
            <thead>
              <tr>
                <th>Nome</th>
                <th>URL</th>
                <th>Tabelas</th>
                <th>Ações</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      secret {item.secret_prefix}…
                    </div>
                  </td>
                  <td style={{ maxWidth: 220, wordBreak: 'break-all' }}>{item.url}</td>
                  <td>{formatTables(item.tables)}</td>
                  <td>{formatActions(item.actions)}</td>
                  <td>{item.enabled ? 'Ativo' : 'Pausado'}</td>
                  <td>
                    <div className="webhook-row-actions">
                      <button
                        type="button"
                        className="btn btn-icon"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => startEdit(item)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        title={testingId === item.id ? 'Testando…' : 'Testar'}
                        aria-label={testingId === item.id ? 'Testando…' : 'Testar'}
                        onClick={() => onTest(item.id)}
                        disabled={testingId === item.id}
                      >
                        {testingId === item.id ? <SpinnerIcon /> : <TestIcon />}
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        title={deliveriesFor === item.id ? 'Ocultar execuções' : 'Execuções'}
                        aria-label={deliveriesFor === item.id ? 'Ocultar execuções' : 'Execuções'}
                        onClick={() => onShowDeliveries(item.id)}
                      >
                        <DeliveriesIcon />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        title="Novo secret"
                        aria-label="Novo secret"
                        onClick={() => onRotate(item.id, item.name)}
                      >
                        <SecretIcon />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        title="Excluir"
                        aria-label="Excluir"
                        onClick={() => onDelete(item.id)}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {deliveriesFor != null ? (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Últimas execuções</h3>
            {!deliveries.length ? (
              <p className="muted">Nenhuma execução ainda.</p>
            ) : (
              <table className="table data">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Evento</th>
                    <th>Status</th>
                    <th>Tentativas</th>
                    <th>HTTP</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td>{d.date_created ? new Date(d.date_created).toLocaleString() : '—'}</td>
                      <td>
                        {d.table_name}.{d.action}
                      </td>
                      <td>{d.status}</td>
                      <td>
                        {d.attempts}/{d.max_attempts}
                      </td>
                      <td>{d.last_http_status ?? '—'}</td>
                      <td style={{ maxWidth: 220, wordBreak: 'break-word' }}>{d.last_error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>

      {revealed?.secret ? (
        <SecretRevealModal
          secret={revealed.secret}
          name={revealed.name}
          onClose={() => setRevealed(null)}
        />
      ) : null}
    </div>
  );
}
