import React, { useMemo, useState } from 'react';
import { fieldLabel } from '../lib/fieldLabels.js';
import {
  filterSummary,
  getFilterKind,
  isFilterableField,
} from '../lib/recordsFilter.js';

let filterSeq = 0;
function nextFilterId() {
  filterSeq += 1;
  return `f_${filterSeq}`;
}

/**
 * Barra de filtros da listagem de registros.
 * Oferece campos conforme as colunas visíveis e opções a partir dos dados.
 */
export function RecordsFilterBar({
  columns = [],
  optionsByField = {},
  filters = [],
  onChange,
}) {
  const filterable = useMemo(
    () => (columns || []).filter((c) => isFilterableField(c)),
    [columns]
  );

  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [valueTo, setValueTo] = useState('');

  const kind = field ? getFilterKind(field, optionsByField[field] || []) : null;
  const options = optionsByField[field] || [];

  function resetDraft() {
    setField('');
    setValue('');
    setValueTo('');
  }

  function addFilter() {
    if (!field || !kind) return;
    if (kind === 'date') {
      if (!value && !valueTo) return;
    } else if (value === '' || value == null) {
      return;
    }

    const next = {
      id: nextFilterId(),
      field,
      kind,
      value: kind === 'boolean' ? value === 'true' || value === true : value,
      valueTo: kind === 'date' ? valueTo : undefined,
    };
    onChange([...(filters || []), next]);
    resetDraft();
  }

  function removeFilter(id) {
    onChange((filters || []).filter((f) => f.id !== id));
  }

  function clearAll() {
    onChange([]);
    resetDraft();
  }

  if (!filterable.length) return null;

  return (
    <div className="records-filter-bar">
      <div className="records-filter-controls">
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
          <label htmlFor="records-filter-field">Filtrar por</label>
          <select
            id="records-filter-field"
            value={field}
            onChange={(e) => {
              setField(e.target.value);
              setValue('');
              setValueTo('');
            }}
          >
            <option value="">Campo…</option>
            {filterable.map((c) => (
              <option key={c} value={c}>
                {fieldLabel(c)}
              </option>
            ))}
          </select>
        </div>

        {kind === 'boolean' ? (
          <div className="field records-filter-value" style={{ marginBottom: 0 }}>
            <label htmlFor="records-filter-value">Valor</label>
            <select
              id="records-filter-value"
              value={value === true ? 'true' : value === false ? 'false' : value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">—</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        ) : null}

        {kind === 'select' ? (
          <div className="field records-filter-value" style={{ marginBottom: 0 }}>
            <label htmlFor="records-filter-value">Valor</label>
            <select
              id="records-filter-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">—</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'true' ? 'Sim' : opt === 'false' ? 'Não' : opt}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {kind === 'date' ? (
          <>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="records-filter-from">De</label>
              <input
                id="records-filter-from"
                type="date"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="records-filter-to">Até</label>
              <input
                id="records-filter-to"
                type="date"
                value={valueTo}
                onChange={(e) => setValueTo(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {kind === 'text' ? (
          <div className="field records-filter-value" style={{ marginBottom: 0 }}>
            <label htmlFor="records-filter-value">Contém</label>
            <input
              id="records-filter-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Texto…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFilter();
                }
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          onClick={addFilter}
          disabled={!field || (kind !== 'date' && (value === '' || value == null)) || (kind === 'date' && !value && !valueTo)}
        >
          Adicionar
        </button>
        {filters.length ? (
          <button type="button" className="btn" onClick={clearAll}>
            Limpar filtros
          </button>
        ) : null}
      </div>

      {filters.length ? (
        <div className="chips records-filter-chips">
          {filters.map((f) => (
            <span key={f.id} className="chip tags-chip on">
              {filterSummary(f, fieldLabel)}
              <button
                type="button"
                className="tags-chip-remove"
                aria-label="Remover filtro"
                onClick={() => removeFilter(f.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
