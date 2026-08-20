import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { collectionLabel, collectionIcon, isDadosCollection } from '../lib/collectionLabels.js';
import { fieldLabel } from '../lib/fieldLabels.js';
import { VisibleFieldsPicker } from '../components/VisibleFieldsPicker.jsx';
import {
  availableFields,
  defaultVisibleFields,
  loadVisibleFields,
  saveVisibleFields,
} from '../lib/visibleFieldsConfig.js';
import {
  applyColumnOrder,
  loadColumnOrder,
  loadSort,
  nextSortState,
  saveColumnOrder,
  saveSort,
} from '../lib/tableStorage.js';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { TagsChipField } from '../components/TagsChipField.jsx';
import { RecordsFilterBar } from '../components/RecordsFilterBar.jsx';
import { JsonObjectField, JsonReadonlyField } from '../components/JsonObjectField.jsx';
import { PhoneInput } from '@kunk/forms';
import {
  isJsonArrayReadonlyField,
  isJsonObjectField,
} from '../lib/jsonFieldSchemas.js';
import { buildRecordFormSections } from '../lib/recordFormSections.js';
import {
  buildApiFilter,
  collectFacetOptions,
  mergeFacetOptions,
} from '../lib/recordsFilter.js';
import {
  fromDateTimeLocalValue,
  isBooleanField,
  isDateOnlyField,
  isDateTimeField,
  isFullNameField,
  isNamePartField,
  isPhoneField,
  isRecordTagsField,
  isUuidCodeField,
  resolveNamePair,
  formatListCell,
  toBooleanValue,
  toDateInputValue,
  toDateTimeLocalValue,
  withSyncedFullName,
} from '../lib/fieldWidgets.js';

export function DataIndexPage({ api }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [samplePanelOpen, setSamplePanelOpen] = useState(false);
  const [sampleSummary, setSampleSummary] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [sampleResult, setSampleResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const schemaRes = await api.adminSchema();
        const collections = (schemaRes.data?.collections || []).filter((c) => isDadosCollection(c.name));

        const withCounts = await Promise.all(
          collections.map(async (c) => {
            try {
              const res = await api.listItems(c.name, 'limit=1&meta=filter_count');
              return {
                name: c.name,
                label: collectionLabel(c.name),
                count: res.meta?.filter_count ?? res.meta?.total_count ?? (res.data?.length || 0),
              };
            } catch {
              return { name: c.name, label: collectionLabel(c.name), count: null };
            }
          })
        );

        withCounts.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        if (!cancelled) setItems(withCounts);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  async function refreshCollections() {
    const schemaRes = await api.adminSchema();
    const collections = (schemaRes.data?.collections || []).filter((c) => isDadosCollection(c.name));

    const withCounts = await Promise.all(
      collections.map(async (c) => {
        try {
          const res = await api.listItems(c.name, 'limit=1&meta=filter_count');
          return {
            name: c.name,
            label: collectionLabel(c.name),
            count: res.meta?.filter_count ?? res.meta?.total_count ?? (res.data?.length || 0),
          };
        } catch {
          return { name: c.name, label: collectionLabel(c.name), count: null };
        }
      })
    );

    withCounts.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    setItems(withCounts);
  }

  async function openSampleModal() {
    setSampleOpen(true);
    setSampleError('');
    setSampleResult(null);
    setSampleLoading(true);
    try {
      const res = await api.getSampleDataSummary();
      setSampleSummary(res.data || { tables: [], total: 0 });
    } catch (err) {
      setSampleError(err.message || 'Falha ao carregar resumo');
      setSampleSummary(null);
    } finally {
      setSampleLoading(false);
    }
  }

  async function confirmDeleteSample() {
    setSampleBusy(true);
    setSampleError('');
    try {
      const res = await api.deleteSampleData();
      setSampleResult(res.data || null);
      setSampleSummary({
        tables: (res.data?.deleted || []).map((row) => ({
          table: row.table,
          label: row.label,
          count: 0,
        })),
        total: 0,
      });
      await refreshCollections();
    } catch (err) {
      setSampleError(err.message || 'Falha ao excluir dados de exemplo');
    } finally {
      setSampleBusy(false);
    }
  }

  if (loading) {
    return <AdminLoader label="Carregando registros…" />;
  }

  return (
    <div>
      <h1>Banco de dados</h1>
      <p className="muted">Visualize e edite os registros cadastrados no sistema.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="grid-2" style={{ marginTop: '1rem' }}>
        {items.map((item) => (
          <Link key={item.name} className="collection-link" to={`/dados/${item.name}`}>
            <span className="collection-link-icon" aria-hidden="true">
              <CollectionIcon name={collectionIcon(item.name)} />
            </span>
            <span className="collection-link-body">
              <strong>{item.label}</strong>
              <div className="muted">
                {item.count == null ? 'Abrir registros' : `${item.count} registro${item.count === 1 ? '' : 's'}`}
              </div>
            </span>
          </Link>
        ))}
      </div>

      <section className="card sample-data-panel" style={{ marginTop: '2.5rem' }}>
        <button
          type="button"
          className="sample-data-panel-trigger"
          aria-expanded={samplePanelOpen}
          onClick={() => setSamplePanelOpen((open) => !open)}
        >
          <span>Excluir dados de exemplo</span>
          <span className="sample-data-panel-chevron" aria-hidden="true">
            {samplePanelOpen ? '▾' : '▸'}
          </span>
        </button>
        {samplePanelOpen ? (
          <div className="sample-data-panel-body">
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Remove apenas registros marcados como dados de demonstração. Dados criados no uso normal do
              sistema não são afetados.
            </p>
            <button type="button" className="btn btn-danger" onClick={openSampleModal}>
              Excluir dados de exemplo
            </button>
          </div>
        ) : null}
      </section>

      {sampleOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !sampleBusy && setSampleOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-data-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-top" style={{ marginBottom: '0.75rem' }}>
              <div>
                <h2 id="sample-data-title" style={{ margin: 0 }}>Excluir dados de exemplo</h2>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  Quantidade de registros de demonstração por tabela
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setSampleOpen(false)}
                aria-label="Fechar"
                disabled={sampleBusy}
              >
                ×
              </button>
            </div>

            {sampleError ? <div className="alert alert-error">{sampleError}</div> : null}
            {sampleResult ? (
              <div className="alert alert-info">
                Removidos {sampleResult.total} registro{sampleResult.total === 1 ? '' : 's'}
                {sampleResult.skipped?.length
                  ? ` · ${sampleResult.skipped.length} preservado(s)`
                  : ''}
                .
              </div>
            ) : null}

            {sampleLoading ? (
              <AdminLoader label="Carregando contagens…" className="admin-loader--embedded" />
            ) : sampleSummary ? (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Tabela</th>
                        <th>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sampleSummary.tables || [])
                        .filter((row) => sampleResult || row.count > 0)
                        .map((row) => (
                          <tr key={row.table}>
                            <td>{row.label}</td>
                            <td className="mono">
                              {sampleResult
                                ? (sampleResult.deleted || []).find((d) => d.table === row.table)?.count ?? 0
                                : row.count}
                            </td>
                          </tr>
                        ))}
                      {(sampleSummary.tables || []).every((row) => row.count === 0) && !sampleResult ? (
                        <tr>
                          <td colSpan={2} className="muted">Nenhum dado de exemplo encontrado.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {!sampleResult && sampleSummary.total > 0 ? (
                  <p className="muted" style={{ marginTop: '0.75rem' }}>
                    Total: <strong>{sampleSummary.total}</strong> registro
                    {sampleSummary.total === 1 ? '' : 's'}. Esta ação não pode ser desfeita.
                  </p>
                ) : null}
              </>
            ) : null}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setSampleOpen(false)} disabled={sampleBusy}>
                {sampleResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!sampleResult && sampleSummary?.total > 0 ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDeleteSample}
                  disabled={sampleBusy || sampleLoading}
                >
                  {sampleBusy ? 'Excluindo…' : 'Confirmar exclusão'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CollectionIcon({ name, size = 22 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  switch (name) {
    case 'users':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'user':
      return (
        <svg {...props}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case 'package':
      return (
        <svg {...props}>
          <path d="M16.5 9.4 7.55 4.24" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="M3.29 7 12 12l8.71-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'handshake':
      return (
        <svg {...props}>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12h12" />
          <path d="M10 6h4" />
          <path d="M10 16h4" />
        </svg>
      );
    case 'building':
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-6h6v6" />
          <path d="M9 9h1" />
          <path d="M14 9h1" />
          <path d="M9 13h1" />
          <path d="M14 13h1" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...props}>
          <path d="M10 2h4" />
          <path d="M11 2v4" />
          <path d="M13 2v4" />
          <rect x="8" y="6" width="8" height="3" rx="0.5" />
          <path d="M9 9v9a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V9" />
          <path d="M9 14h6" />
        </svg>
      );
    case 'box':
      return (
        <svg {...props}>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'stethoscope':
      return (
        <svg {...props}>
          <path d="M11 2v2" />
          <path d="M5 2v2" />
          <path d="M5 4a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4" />
          <path d="M9 8v5a6 6 0 0 0 6 6" />
          <circle cx="19" cy="14" r="3" />
          <path d="M19 11v-1a2 2 0 0 0-2-2h-1" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...props}>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
      );
    case 'clipboard-check':
      return (
        <svg {...props}>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      );
    case 'file-text':
      return (
        <svg {...props}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      );
    case 'tag':
      return (
        <svg {...props}>
          <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
          <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M12 3v18" />
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
        </svg>
      );
  }
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.5 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.6-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.6a7.6 7.6 0 0 0 1.7 1l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VisibleFieldsModal({
  open,
  collection,
  schema,
  selected,
  onChange,
  onClose,
  onSave,
  busy,
  error,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visible-fields-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-top" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h2 id="visible-fields-title" style={{ margin: 0 }}>Campos visíveis</h2>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {collectionLabel(collection)} — desmarque para remover; use o select para adicionar
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <VisibleFieldsPicker
          schema={schema}
          selected={selected}
          onChange={onChange}
          idPrefix={`modal-${collection}`}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy || selected.length === 0}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DataCollectionPage({ api }) {
  const { collection } = useParams();
  const label = collectionLabel(collection);
  const [rows, setRows] = useState([]);
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(null);
  const [visibleCols, setVisibleCols] = useState(['id']);
  const [configItem, setConfigItem] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftCols, setDraftCols] = useState([]);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [sort, setSort] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState([]);
  const [facetOptions, setFacetOptions] = useState({});
  const dragFromRef = useRef(null);
  const allowed = isDadosCollection(collection);

  useEffect(() => {
    if (!allowed) return undefined;
    setSort(loadSort(collection));
    setLoading(true);
    setRows([]);
    setTotal(null);
    setError('');
    setFilters([]);
    setFacetOptions({});
    setSearch('');
  }, [collection, allowed]);

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const schemaRes = await api.adminSchema();
        const col = (schemaRes.data?.collections || []).find((c) => c.name === collection);
        if (!cancelled) setSchema(col || null);

        const loaded = await loadVisibleFields(api, collection, col);
        let ordered = ['id'];
        if (!cancelled) {
          ordered = applyColumnOrder(loaded.fields, loadColumnOrder(collection));
          setVisibleCols(ordered);
          setConfigItem(loaded.configItem);
        }

        const qs = new URLSearchParams({ limit: '50', meta: 'filter_count' });
        if (search) qs.set('search', search);
        const apiFilter = buildApiFilter(filters);
        if (apiFilter) qs.set('filter', JSON.stringify(apiFilter));
        if (sort?.field && sort?.dir) {
          qs.set('sort', sort.dir === 'desc' ? `-${sort.field}` : sort.field);
        }
        const res = await api.listItems(collection, qs.toString());
        if (!cancelled) {
          const data = res.data || [];
          setRows(data);
          setTotal(res.meta?.filter_count ?? res.meta?.total_count ?? null);
          setFacetOptions((prev) =>
            mergeFacetOptions(prev, collectFacetOptions(data, ordered))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setRows([]);
          setTotal(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, collection, search, filters, sort, allowed]);

  const previewCols = useMemo(() => {
    if (!schema) return visibleCols.length ? visibleCols : ['id'];
    const allowedSet = new Set(availableFields(schema));
    const cols = visibleCols.filter((c) => allowedSet.has(c));
    return cols.length ? cols : defaultVisibleFields(schema);
  }, [schema, visibleCols]);

  const displayRows = rows;

  if (!allowed) {
    return <Navigate to="/dados" replace />;
  }

  function openSettings() {
    setDraftCols(previewCols);
    setSettingsError('');
    setSettingsOpen(true);
  }

  async function saveSettings() {
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const res = await saveVisibleFields(api, collection, draftCols, configItem);
      const item = res.data || configItem;
      setConfigItem(item);
      const ordered = applyColumnOrder(draftCols, loadColumnOrder(collection));
      setVisibleCols(ordered);
      saveColumnOrder(collection, ordered);
      setSettingsOpen(false);
    } catch (err) {
      setSettingsError(err.message || 'Falha ao salvar');
    } finally {
      setSettingsBusy(false);
    }
  }

  function reorderColumns(fromField, toField) {
    if (!fromField || !toField || fromField === toField) return;
    const next = [...previewCols];
    const fromIdx = next.indexOf(fromField);
    const toIdx = next.indexOf(toField);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromField);
    setVisibleCols(next);
    saveColumnOrder(collection, next);
  }

  function onHeaderClick(field) {
    const next = nextSortState(sort, field);
    setSort(next);
    saveSort(collection, next);
  }

  if (loading && rows.length === 0) {
    return <AdminLoader label="Carregando registros…" />;
  }

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>{label}</h1>
          <p className="muted">
            <Link to="/dados">← Banco de dados</Link>
            {total != null ? ` · ${total} registro${total === 1 ? '' : 's'}` : null}
            {loading ? ' · atualizando…' : null}
          </p>
        </div>
        <Link className="btn btn-primary" to={`/dados/${collection}/novo`}>Novo registro</Link>
      </div>

      <div className="table-toolbar">
            <div className="field" style={{ maxWidth: 320, marginBottom: 0 }}>
              <label htmlFor="search">Busca</label>
              <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar registros…" />
            </div>
            <button
              type="button"
              className="btn btn-icon"
              onClick={openSettings}
              title="Configurar campos visíveis"
              aria-label="Configurar campos visíveis"
            >
              <SettingsIcon />
            </button>
          </div>
          <RecordsFilterBar
            columns={previewCols}
            optionsByField={facetOptions}
            filters={filters}
            onChange={setFilters}
          />
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {previewCols.map((c) => {
                    const active = sort?.field === c;
                    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
                    return (
                      <th
                        key={c}
                        className={`th-interactive${active ? ' th-sorted' : ''}${dragFrom === c ? ' th-dragging' : ''}`}
                        aria-sort={ariaSort}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = e.dataTransfer.getData('text/plain') || dragFromRef.current;
                          reorderColumns(from, c);
                          setDragFrom(null);
                        }}
                      >
                        <span
                          className="th-drag"
                          draggable
                          title="Arrastar para reordenar colunas"
                          onDragStart={(e) => {
                            dragFromRef.current = c;
                            setDragFrom(c);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', c);
                          }}
                          onDragEnd={() => {
                            dragFromRef.current = null;
                            setDragFrom(null);
                          }}
                        >
                          ⋮⋮
                        </span>
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => onHeaderClick(c)}
                          title={
                            active
                              ? sort.dir === 'asc'
                                ? 'Ordenado crescente — clique para decrescente'
                                : 'Ordenado decrescente — clique para limpar'
                              : 'Clique para ordenar'
                          }
                        >
                          <span className="th-label">{fieldLabel(c)}</span>
                          <span className="th-sort" aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(previewCols.length, 1)} className="muted">Nenhum registro encontrado.</td>
                  </tr>
                ) : (
                  displayRows.map((row) => (
                    <tr key={row.id ?? JSON.stringify(row)}>
                      {previewCols.map((c) => (
                        <td key={c}>
                          {c === (schema?.pk?.name || 'id') || c === 'id' ? (
                            <Link to={`/dados/${collection}/${row.id}`}>{String(row[c] ?? '')}</Link>
                          ) : (
                            <span className="mono">{formatListCell(row[c], c)}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

      <VisibleFieldsModal
        open={settingsOpen}
        collection={collection}
        schema={schema}
        selected={draftCols}
        onChange={setDraftCols}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        busy={settingsBusy}
        error={settingsError}
      />
    </div>
  );
}

export function DataItemPage({ api, isNew = false }) {
  const { collection, id } = useParams();
  const label = collectionLabel(collection);
  const navigate = useNavigate();
  const [schema, setSchema] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const allowed = isDadosCollection(collection);

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const schemaRes = await api.adminSchema();
        const col = (schemaRes.data?.collections || []).find((c) => c.name === collection);
        if (!cancelled) setSchema(col || null);
        if (!isNew && id) {
          const res = await api.getItem(collection, id);
          if (!cancelled) {
            const cols = col?.columns || Object.keys(res.data || {});
            setForm(withSyncedFullName(res.data || {}, cols));
          }
        } else if (!cancelled) {
          setForm(withSyncedFullName({}, col?.columns || []));
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, collection, id, isNew, allowed]);

  const editableCols = useMemo(() => {
    if (!schema) return [];
    const readonly = new Set(schema.readonly || []);
    if (!isNew) {
      for (const field of schema.readonlyOnUpdate || []) readonly.add(field);
    }
    const sensitive = new Set(schema.sensitive || []);
    return (schema.columns || []).filter((c) => !readonly.has(c) && !sensitive.has(c));
  }, [schema, isNew]);

  const formSections = useMemo(
    () => buildRecordFormSections(collection, editableCols),
    [collection, editableCols],
  );

  const relations = schema?.relations || [];

  function patchForm(name, value) {
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (isNamePartField(name, editableCols) || isFullNameField(name)) {
        return withSyncedFullName(next, editableCols);
      }
      return next;
    });
  }

  if (!allowed) {
    return <Navigate to="/dados" replace />;
  }

  if (loading) {
    return <AdminLoader label="Carregando registro…" />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const synced = withSyncedFullName(form, editableCols);
      if (synced !== form) setForm(synced);
      const body = {};
      for (const col of editableCols) {
        if (synced[col] !== undefined) body[col] = synced[col] === '' ? null : synced[col];
      }
      if (isNew) {
        const res = await api.createItem(collection, body);
        navigate(`/dados/${collection}/${res.data.id}`);
        return;
      }
      await api.updateItem(collection, id, body);
      setMessage('Salvo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Excluir este registro?')) return;
    setBusy(true);
    try {
      await api.deleteItem(collection, id);
      navigate(`/dados/${collection}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>{isNew ? `Novo registro · ${label}` : `${label} #${id}`}</h1>
          <p className="muted"><Link to={`/dados/${collection}`}>← {label}</Link></p>
        </div>
        <div className="record-form-actions record-form-actions--top">
          <button className="btn btn-primary" type="submit" form="record-form" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
          {!isNew ? (
            <button className="btn btn-danger" type="button" onClick={onDelete} disabled={busy}>
              Excluir
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}

      {relations.length ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <strong>Relacionados</strong>
          <ul>
            {relations.map((rel) => {
              const val = form[rel.field];
              if (!isDadosCollection(rel.collection)) {
                return (
                  <li key={rel.field}>
                    <span>{fieldLabel(rel.field)}</span>
                    {': '}
                    <span className="muted">{val != null && val !== '' ? String(val) : 'vazio'}</span>
                  </li>
                );
              }
              return (
                <li key={rel.field}>
                  <span>{fieldLabel(rel.field)}</span>
                  {' → '}
                  {val != null && val !== '' ? (
                    <Link to={`/dados/${rel.collection}/${val}`}>
                      {collectionLabel(rel.collection)} / {String(val)}
                    </Link>
                  ) : (
                    <span className="muted">vazio</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <form id="record-form" className="card record-form" onSubmit={onSubmit}>
        {formSections.map((section) => (
          <section className="record-form-section" key={section.id} aria-labelledby={`sec-${section.id}`}>
            <h2 className="record-form-section-title" id={`sec-${section.id}`}>
              {section.title}
            </h2>
            <div className="record-form-grid">
              {section.fields.map((col) => {
                const wide =
                  isRecordTagsField(collection, col) ||
                  isJsonObjectField(col, form[col]) ||
                  isJsonArrayReadonlyField(col, form[col]);
                return (
                  <div className={`field${wide ? ' field--wide' : ''}`} key={col}>
                    <label htmlFor={`f-${col}`}>{fieldLabel(col)}</label>
                    <RecordFieldInput
                      id={`f-${col}`}
                      api={api}
                      collection={collection}
                      name={col}
                      value={form[col]}
                      columns={editableCols}
                      onChange={(next) => patchForm(col, next)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </form>
    </div>
  );
}

function RecordFieldInput({ id, api, collection, name, value, columns, onChange }) {
  if (isRecordTagsField(collection, name)) {
    return (
      <TagsChipField
        id={id}
        api={api}
        collection={collection}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (isJsonObjectField(name, value)) {
    return (
      <JsonObjectField
        id={id}
        name={name}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (isJsonArrayReadonlyField(name, value) || (typeof value === 'object' && value != null && Array.isArray(value))) {
    return <JsonReadonlyField value={value} />;
  }

  if (isFullNameField(name) && resolveNamePair(columns)) {
    return (
      <input
        id={id}
        value={value == null ? '' : String(value)}
        readOnly
        title="Preenchido automaticamente a partir do nome e sobrenome"
        className="input-readonly"
      />
    );
  }

  if (isUuidCodeField(name, value)) {
    return (
      <input
        id={id}
        value={value == null ? '' : String(value)}
        readOnly
        title="Código gerado pelo sistema (não editável)"
        className="input-readonly mono"
      />
    );
  }

  if (isBooleanField(name, value)) {
    const boolVal = toBooleanValue(value);
    const group = id || name;
    return (
      <div className="radio-group" role="radiogroup">
        <label className="radio-option">
          <input
            type="radio"
            name={group}
            checked={boolVal === true}
            onChange={() => onChange(true)}
          />
          Sim
        </label>
        <label className="radio-option">
          <input
            type="radio"
            name={group}
            checked={boolVal === false}
            onChange={() => onChange(false)}
          />
          Não
        </label>
      </div>
    );
  }

  if (isPhoneField(name)) {
    return (
      <PhoneInput
        value={value || ''}
        onChange={onChange}
        inputProps={{ id, name }}
        inputClass="admin-phone-control"
      />
    );
  }

  if (isDateOnlyField(name)) {
    return (
      <input
        id={id}
        type="date"
        value={toDateInputValue(value)}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }

  if (isDateTimeField(name)) {
    return (
      <input
        id={id}
        type="datetime-local"
        value={toDateTimeLocalValue(value)}
        onChange={(e) => onChange(fromDateTimeLocalValue(e.target.value))}
      />
    );
  }

  // Objetos restantes: nunca expor JSON editável
  if (typeof value === 'object' && value != null) {
    return <JsonReadonlyField value={value} />;
  }

  return (
    <input
      id={id}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
