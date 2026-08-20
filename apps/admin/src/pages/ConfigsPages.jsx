import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { VisibleFieldsPicker } from '../components/VisibleFieldsPicker.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { collectionLabel, isDadosCollection } from '../lib/collectionLabels.js';
import {
  defaultVisibleFields,
  parseFieldsJson,
  parseVisibleFieldsKey,
  saveVisibleFields,
} from '../lib/visibleFieldsConfig.js';

const SYSTEM_LABELS = {
  admin: 'Admin',
  registration: 'Cadastramento',
  kunk: 'Kunk',
  triage: 'Triagem',
  panel: 'Painel',
  terms: 'Termos',
  api: 'API',
  modules: 'Módulos',
  services: 'Serviços',
  store: 'Loja',
};

const SYSTEM_BLURBS = {
  admin: 'Campos visíveis e opções do painel Admin',
  registration: 'Branding e textos do cadastramento',
  kunk: 'Aparência, páginas e preferências do app operacional',
  triage: 'Formulário público e fila de triagem',
  panel: 'Painel / fila pública',
  terms: 'Termos e documentos',
  api: 'Parâmetros da API',
  modules: 'Flags de módulos',
  services: 'Tipos e relatório de serviços',
  store: 'Loja e frete',
};

function systemLabel(name) {
  return SYSTEM_LABELS[name] || (name ? name.charAt(0).toUpperCase() + name.slice(1) : name);
}

function systemBlurb(name) {
  return SYSTEM_BLURBS[name] || 'Variáveis deste sistema';
}

function sourceLabel(source) {
  const s = String(source || '').toLowerCase();
  if (s === 'db' || s === 'database') return 'Banco';
  if (s === 'env') return 'Env';
  if (s === 'hardcoded' || s === 'default') return 'Padrão';
  return source || '—';
}

function sourceClass(source) {
  const s = String(source || '').toLowerCase();
  if (s === 'db' || s === 'database') return 'source-pill source-pill--db';
  if (s === 'env') return 'source-pill source-pill--env';
  return 'source-pill source-pill--default';
}

export function ConfigsIndexPage({ api }) {
  const [systems, setSystems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.configSystems();
        const list = Array.isArray(res.data) ? res.data : res.data?.systems || [];
        if (!cancelled) setSystems(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const sorted = useMemo(
    () =>
      [...systems].sort((a, b) =>
        systemLabel(a.system).localeCompare(systemLabel(b.system), 'pt-BR')
      ),
    [systems]
  );

  if (loading) {
    return <AdminLoader label="Carregando variáveis…" />;
  }

  return (
    <div className="configs-page">
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Variáveis</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Agrupadas por sistema · cascata banco → env → padrão
          </p>
        </div>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}

      {sorted.length === 0 ? (
        <div className="card configs-empty">
          <p className="muted" style={{ margin: 0 }}>
            Nenhum sistema de configuração encontrado.
          </p>
        </div>
      ) : (
        <div className="configs-systems-grid">
          {sorted.map((s) => {
            const count = Number(s.key_count) || 0;
            return (
              <Link
                key={s.system}
                className="configs-system-card"
                to={`/configs/${encodeURIComponent(s.system)}`}
              >
                <span className="configs-system-icon" aria-hidden="true">
                  {systemLabel(s.system).charAt(0)}
                </span>
                <span className="configs-system-body">
                  <strong className="configs-system-title">{systemLabel(s.system)}</strong>
                  <span className="muted configs-system-blurb">{systemBlurb(s.system)}</span>
                  <span className="configs-system-meta">
                    <code className="mono">{s.system}</code>
                    <span className="configs-key-badge">
                      {count} {count === 1 ? 'chave' : 'chaves'}
                    </span>
                  </span>
                </span>
                <span className="configs-system-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ConfigsSystemPage({ api }) {
  const { system } = useParams();
  const isAdmin = system === 'admin';
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState({});
  const [schemaByCollection, setSchemaByCollection] = useState({});
  const [dadosCollections, setDadosCollections] = useState([]);
  const [fieldDrafts, setFieldDrafts] = useState({});
  const [fieldsDirty, setFieldsDirty] = useState({});
  const [fieldsBusy, setFieldsBusy] = useState({});
  const [openCollections, setOpenCollections] = useState({});
  const [loading, setLoading] = useState(true);

  async function reload() {
    const res = await api.configBySystem(system);
    setItems(res.data?.items || []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, system]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const schemaRes = await api.adminSchema();
        const collections = (schemaRes.data?.collections || [])
          .filter((c) => isDadosCollection(c.name))
          .sort((a, b) => collectionLabel(a.name).localeCompare(collectionLabel(b.name), 'pt-BR'));
        const map = {};
        for (const c of collections) map[c.name] = c;
        if (!cancelled) {
          setDadosCollections(collections);
          setSchemaByCollection(map);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, isAdmin]);

  const visibleFieldItems = useMemo(() => {
    const visible = [];
    for (const item of items) {
      if (parseVisibleFieldsKey(item.key)) visible.push(item);
    }
    visible.sort((a, b) => {
      const ca = parseVisibleFieldsKey(a.key) || '';
      const cb = parseVisibleFieldsKey(b.key) || '';
      return collectionLabel(ca).localeCompare(collectionLabel(cb), 'pt-BR');
    });
    return visible;
  }, [items]);

  const configByCollection = useMemo(() => {
    const map = {};
    for (const item of visibleFieldItems) {
      const name = parseVisibleFieldsKey(item.key);
      if (name) map[name] = item;
    }
    return map;
  }, [visibleFieldItems]);

  useEffect(() => {
    if (!isAdmin || !dadosCollections.length) return;
    setFieldDrafts((prev) => {
      const next = { ...prev };
      for (const col of dadosCollections) {
        if (fieldsDirty[col.name]) continue;
        const item = configByCollection[col.name];
        const parsed = parseFieldsJson(item?.value || item?.resolved_value);
        const schema = schemaByCollection[col.name];
        const allowed = new Set(
          (schema?.columns || []).filter((c) => !(schema.sensitive || []).includes(c))
        );
        if (parsed?.length) {
          const filtered = parsed.filter((f) => allowed.has(f));
          next[col.name] = filtered.length ? filtered : defaultVisibleFields(schema);
        } else {
          next[col.name] = defaultVisibleFields(schema);
        }
      }
      return next;
    });
  }, [isAdmin, dadosCollections, configByCollection, schemaByCollection, fieldsDirty]);

  async function saveItem(item) {
    setError('');
    setMessage('');
    try {
      const value = drafts[item.id] !== undefined ? drafts[item.id] : item.is_sensitive ? '' : item.value;
      if (item.is_sensitive && !value) {
        setError('Informe um novo valor para config sensível');
        return;
      }
      await api.updateConfig(item.id, { value });
      setMessage(`Salvo: ${item.key}`);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearItem(item) {
    setError('');
    try {
      await api.clearConfig(item.id);
      setMessage(`Limpo: ${item.key}`);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveVisibleForCollection(collection) {
    setError('');
    setMessage('');
    setFieldsBusy((b) => ({ ...b, [collection]: true }));
    try {
      const fields = fieldDrafts[collection] || [];
      if (!fields.length) {
        setError('Selecione ao menos um campo');
        return;
      }
      await saveVisibleFields(api, collection, fields, configByCollection[collection] || null);
      setMessage(`Campos visíveis salvos: ${collectionLabel(collection)}`);
      setFieldsDirty((d) => {
        const next = { ...d };
        delete next[collection];
        return next;
      });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setFieldsBusy((b) => ({ ...b, [collection]: false }));
    }
  }

  async function clearVisibleForCollection(collection) {
    const item = configByCollection[collection];
    if (!item) return;
    setError('');
    try {
      await api.clearConfig(item.id);
      setMessage(`Limpo: ${collectionLabel(collection)}`);
      setFieldsDirty((d) => {
        const next = { ...d };
        delete next[collection];
        return next;
      });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleCollection(name) {
    setOpenCollections((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  if (loading) {
    return <AdminLoader label="Carregando variáveis…" />;
  }

  return (
    <div className="configs-page">
      <div className="admin-top">
        <div>
          <p className="configs-breadcrumb muted">
            <Link to="/configs">Variáveis</Link>
            <span aria-hidden="true"> / </span>
            <span>{systemLabel(system)}</span>
          </p>
          <h1 style={{ margin: 0 }}>Variáveis · {systemLabel(system)}</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {systemBlurb(system)} · <code className="mono">{system}</code>
          </p>
        </div>
      </div>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? <div className="alert alert-info">{message}</div> : null}

      {isAdmin ? (
        <section className="configs-section">
          <div className="configs-section-head">
            <h2 style={{ margin: 0 }}>Campos visíveis em Registros</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Clique em uma tabela para configurar os campos da listagem.
            </p>
          </div>
          {dadosCollections.length === 0 ? (
            <AdminLoader label="Carregando tabelas…" className="admin-loader--embedded" />
          ) : (
            <div className="config-accordion">
              {dadosCollections.map((col) => {
                const schema = schemaByCollection[col.name];
                const selected = fieldDrafts[col.name] || defaultVisibleFields(schema);
                const hasSaved = Boolean(configByCollection[col.name]);
                const busy = Boolean(fieldsBusy[col.name]);
                const open = Boolean(openCollections[col.name]);
                return (
                  <div key={col.name} className={`config-accordion-item${open ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="config-accordion-trigger"
                      aria-expanded={open}
                      onClick={() => toggleCollection(col.name)}
                    >
                      <span className="config-accordion-chevron" aria-hidden="true">
                        {open ? '▾' : '▸'}
                      </span>
                      <span className="config-accordion-title">
                        <strong>{collectionLabel(col.name)}</strong>
                        <span className="mono muted">{col.name}</span>
                      </span>
                      <span className={`configs-status-pill${hasSaved ? ' is-saved' : ''}`}>
                        {hasSaved ? 'salvo' : 'padrão'} · {selected.length} campos
                      </span>
                    </button>
                    {open ? (
                      <div className="config-accordion-body">
                        <VisibleFieldsPicker
                          schema={schema}
                          selected={selected}
                          idPrefix={`cfg-${col.name}`}
                          onChange={(next) => {
                            setFieldDrafts((d) => ({ ...d, [col.name]: next }));
                            setFieldsDirty((d) => ({ ...d, [col.name]: true }));
                          }}
                        />
                        <div className="configs-row-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || selected.length === 0}
                            onClick={() => saveVisibleForCollection(col.name)}
                          >
                            {busy ? 'Salvando…' : 'Salvar'}
                          </button>
                          {hasSaved ? (
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => clearVisibleForCollection(col.name)}
                            >
                              Limpar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="configs-section">
          <div className="configs-section-head">
            <h2 style={{ margin: 0 }}>Chaves</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              {items.length === 0
                ? 'Nenhuma chave neste grupo.'
                : `${items.length} chave${items.length === 1 ? '' : 's'} neste sistema`}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="card configs-empty">
              <p className="muted" style={{ margin: 0 }}>
                Nenhuma key neste grupo.
              </p>
            </div>
          ) : (
            <div className="configs-keys-list">
              {items.map((item) => {
                const draftValue =
                  drafts[item.id] !== undefined
                    ? drafts[item.id]
                    : item.is_sensitive
                      ? ''
                      : item.value || '';
                return (
                  <article key={item.id} className="card configs-key-card">
                    <header className="configs-key-head">
                      <div className="configs-key-titles">
                        <code className="mono configs-key-name">{item.key}</code>
                        {item.description ? (
                          <p className="muted configs-key-desc">{item.description}</p>
                        ) : null}
                      </div>
                      <span className={sourceClass(item.source)}>{sourceLabel(item.source)}</span>
                    </header>
                    <div className="configs-key-body">
                      <label className="field configs-key-field">
                        <span className="configs-key-field-label">
                          {item.is_sensitive ? 'Valor (sensível)' : 'Valor'}
                        </span>
                        <input
                          type={item.is_sensitive ? 'password' : 'text'}
                          placeholder={
                            item.is_sensitive
                              ? item.has_value
                                ? '********'
                                : '(vazio)'
                              : item.resolved_value || ''
                          }
                          value={draftValue}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                          }
                        />
                      </label>
                      <div className="configs-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => saveItem(item)}
                        >
                          Salvar
                        </button>
                        <button type="button" className="btn" onClick={() => clearItem(item)}>
                          Limpar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
