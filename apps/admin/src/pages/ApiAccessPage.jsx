import React, { useCallback, useEffect, useState } from 'react';
import {
  API_ACCESS_DEFAULTS,
  API_TOKEN_ACTIONS,
  API_TOKEN_COLLECTION_LABELS,
  API_TOKEN_COLLECTIONS,
} from '@kunk/config';
import { AdminLoader } from '../components/AdminLoader.jsx';
import {
  emptyScopeMatrix,
  loadApiAccess,
  matrixFromScopes,
  saveApiAccess,
  scopesFromMatrix,
} from '../lib/apiAccessConfig.js';

function formatScopesSummary(scopes) {
  if (!scopes?.length) return 'Sem permissões';
  if (scopes.includes('*')) return 'Acesso total (*)';
  if (scopes.length <= 3) return scopes.join(', ');
  return `${scopes.slice(0, 3).join(', ')} (+${scopes.length - 3})`;
}

function TokenRevealModal({ token, label, onClose }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="api-token-reveal-title">
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <h2 id="api-token-reveal-title" style={{ marginTop: 0 }}>
          Token criado
        </h2>
        <p className="muted">
          Copie o bearer token agora. Ele não será exibido novamente após fechar esta janela ou atualizar a página.
        </p>
        {label ? (
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong>Rótulo:</strong> {label}
          </p>
        ) : null}
        <code className="api-token-secret" data-testid="api-token-plaintext">
          {token}
        </code>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn" onClick={onCopy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} data-testid="api-token-reveal-close">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

export function ApiAccessPage({ api }) {
  const [enabled, setEnabled] = useState(API_ACCESS_DEFAULTS.enabled);
  const [baseline, setBaseline] = useState({ ...API_ACCESS_DEFAULTS });
  const [itemsByKey, setItemsByKey] = useState({});
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [label, setLabel] = useState('');
  const [matrix, setMatrix] = useState(() => emptyScopeMatrix(API_TOKEN_COLLECTIONS));
  const [revealed, setRevealed] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const refreshTokens = useCallback(async (isEnabled) => {
    if (!isEnabled) {
      setTokens([]);
      return;
    }
    try {
      const res = await api.listApiTokens();
      setTokens(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (err.code === 'API_DISABLED') {
        setTokens([]);
        return;
      }
      throw err;
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { values, itemsByKey: items } = await loadApiAccess(api);
        if (cancelled) return;
        setEnabled(values.enabled);
        setBaseline(values);
        setItemsByKey(items);
        await refreshTokens(values.enabled);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar acesso via API');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refreshTokens]);

  function setAction(collection, action, checked) {
    setMatrix((prev) => ({
      ...prev,
      [collection]: { ...prev[collection], [action]: checked },
    }));
  }

  function selectAllScopes() {
    const next = emptyScopeMatrix(API_TOKEN_COLLECTIONS);
    for (const collection of API_TOKEN_COLLECTIONS) {
      for (const a of API_TOKEN_ACTIONS) {
        next[collection][a.key] = true;
      }
    }
    setMatrix(next);
  }

  function startEdit(token) {
    setEditingId(token.id);
    setLabel(token.label || token.email || '');
    setMatrix({
      ...emptyScopeMatrix(API_TOKEN_COLLECTIONS),
      ...matrixFromScopes(token.scopes, API_TOKEN_COLLECTIONS),
    });
    setMessage('');
    setError('');
  }

  function resetForm() {
    setEditingId(null);
    setLabel('');
    setMatrix(emptyScopeMatrix(API_TOKEN_COLLECTIONS));
  }

  async function onSaveEnabled(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextItems = await saveApiAccess(api, { enabled }, baseline, itemsByKey);
      setItemsByKey(nextItems);
      setBaseline({ enabled });
      setMessage(enabled ? 'Acesso via API habilitado.' : 'Acesso via API desabilitado. Tokens Bearer deixam de autenticar.');
      await refreshTokens(enabled);
      if (!enabled) resetForm();
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateOrUpdate(e) {
    e.preventDefault();
    const scopes = scopesFromMatrix(matrix, API_TOKEN_COLLECTIONS);
    if (!scopes.length) {
      setError('Selecione ao menos uma permissão.');
      return;
    }
    setCreating(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await api.updateApiToken(editingId, { label: label.trim() || 'api-token', scopes });
        setMessage('Permissões do token atualizadas.');
        resetForm();
      } else {
        const res = await api.createApiToken({
          label: label.trim() || 'api-token',
          scopes,
        });
        setRevealed({
          token: res.data?.token,
          label: res.data?.label || res.data?.email,
        });
        resetForm();
      }
      await refreshTokens(true);
    } catch (err) {
      setError(err.message || 'Falha ao salvar token');
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id) {
    if (!window.confirm('Revogar este token? Integrações que o usam deixarão de autenticar.')) return;
    setError('');
    setMessage('');
    try {
      await api.revokeApiToken(id);
      if (editingId === id) resetForm();
      setMessage('Token revogado.');
      await refreshTokens(true);
    } catch (err) {
      setError(err.message || 'Falha ao revogar');
    }
  }

  if (loading) return <AdminLoader label="Carregando acesso via API…" />;

  return (
    <div className="api-access-page">
      <h1 style={{ marginTop: 0 }}>API</h1>
      <p className="muted">
        Gere bearer tokens para integrar sistemas externos com a kunk-api. Por padrão o acesso fica desligado;
        com a API desabilitada, Bearer deixa de autenticar e não é possível criar ou listar tokens.
      </p>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <form className="card" onSubmit={onSaveEnabled} style={{ maxWidth: 640, marginBottom: '1.25rem' }}>
        <label
          className={`ext-flag${enabled ? ' ext-flag--active' : ''}`}
          data-testid="api-enabled-toggle"
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setMessage('');
            }}
          />
          <span className="ext-flag-body">
            <strong>Habilitar acesso via API</strong>
            <span className="muted">Default desligado. Controla Bearer e gestão de tokens.</span>
          </span>
        </label>
        <div style={{ marginTop: '1rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || enabled === baseline.enabled}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      {!enabled ? (
        <div className="alert alert-info" data-testid="api-disabled-notice">
          A API está desabilitada. Habilite e salve para criar tokens e permitir autenticação Bearer.
        </div>
      ) : (
        <>
          <section className="card" style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ marginTop: 0 }}>{editingId ? 'Editar permissões' : 'Novo token'}</h2>
            <form onSubmit={onCreateOrUpdate}>
              <label className="field">
                <span>Rótulo</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="ex.: integração ERP"
                  data-testid="api-token-label"
                />
              </label>

              <div className="api-scope-block">
                <p className="api-scope-block__hint muted">
                  Permissões por tabela (Ler / Escrever / Excluir). Escrever cobre criar e atualizar.
                </p>

                <div className="api-scope-block__toolbar">
                  <button
                    type="button"
                    className="btn"
                    onClick={selectAllScopes}
                    data-testid="api-scope-select-all"
                  >
                    Selecionar tudo
                  </button>
                </div>

                <div className="api-scope-matrix" data-testid="api-scope-matrix">
                  <table className="api-scope-matrix__table">
                    <thead>
                      <tr>
                        <th scope="col">Tabela</th>
                        {API_TOKEN_ACTIONS.map((a) => (
                          <th key={a.key} scope="col">
                            {a.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {API_TOKEN_COLLECTIONS.map((collection) => (
                        <tr key={collection}>
                          <th scope="row" className="api-scope-matrix__label">
                            {API_TOKEN_COLLECTION_LABELS[collection] || collection}
                          </th>
                          {API_TOKEN_ACTIONS.map((a) => (
                            <td key={a.key} className="api-scope-matrix__cell">
                              <label className="api-scope-matrix__check">
                                <input
                                  type="checkbox"
                                  checked={Boolean(matrix[collection]?.[a.key])}
                                  onChange={(e) => setAction(collection, a.key, e.target.checked)}
                                  aria-label={`${API_TOKEN_COLLECTION_LABELS[collection] || collection} ${a.label}`}
                                />
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={creating} data-testid="api-token-submit">
                  {creating ? 'Salvando…' : editingId ? 'Atualizar permissões' : 'Gerar token'}
                </button>
                {editingId ? (
                  <button type="button" className="btn" onClick={resetForm}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Tokens</h2>
            {tokens.length === 0 ? (
              <p className="muted" data-testid="api-tokens-empty">Nenhum token criado.</p>
            ) : (
              <ul className="api-token-list" data-testid="api-tokens-list">
                {tokens.map((t) => (
                  <li key={t.id} className="api-token-list__item">
                    <div>
                      <strong>{t.label || t.email}</strong>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {formatScopesSummary(t.scopes)}
                      </div>
                    </div>
                    <div className="api-token-list__actions">
                      <button type="button" className="btn" onClick={() => startEdit(t)}>
                        Permissões
                      </button>
                      <button type="button" className="btn" onClick={() => onRevoke(t.id)}>
                        Revogar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {revealed?.token ? (
        <TokenRevealModal
          token={revealed.token}
          label={revealed.label}
          onClose={() => setRevealed(null)}
        />
      ) : null}
    </div>
  );
}
