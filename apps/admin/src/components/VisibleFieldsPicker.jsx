import React, { useMemo } from 'react';
import { fieldLabel } from '../lib/fieldLabels.js';
import { availableFields } from '../lib/visibleFieldsConfig.js';

/**
 * Campos visíveis: checkboxes só dos selecionados; select para adicionar os demais.
 */
export function VisibleFieldsPicker({ schema, selected, onChange, idPrefix = 'vf' }) {
  const available = useMemo(() => availableFields(schema), [schema]);
  const availableSet = useMemo(() => new Set(available), [available]);

  const selectedOrdered = useMemo(
    () => (selected || []).filter((f) => availableSet.has(f)),
    [selected, availableSet],
  );

  const remaining = useMemo(() => {
    const set = new Set(selectedOrdered);
    return available
      .filter((f) => !set.has(f))
      .map((field) => ({ field, label: fieldLabel(field) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
  }, [available, selectedOrdered]);

  function remove(field) {
    if (selectedOrdered.length <= 1) return;
    onChange((selected || []).filter((f) => f !== field));
  }

  function add(field) {
    if (!field || (selected || []).includes(field)) return;
    onChange([...(selected || []), field]);
  }

  return (
    <div className="visible-fields-picker">
      <div className="field-checklist">
        {selectedOrdered.length === 0 ? (
          <div className="muted" style={{ padding: '0.5rem' }}>Nenhum campo visível.</div>
        ) : (
          selectedOrdered.map((field) => (
            <label key={field} className="check-row">
              <input
                type="checkbox"
                checked
                onChange={() => remove(field)}
                aria-label={`Remover ${fieldLabel(field)}`}
              />
              <span>{fieldLabel(field)}</span>
            </label>
          ))
        )}
      </div>
      {remaining.length > 0 ? (
        <div className="field" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-add`}>Adicionar campo</label>
          <select
            id={`${idPrefix}-add`}
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (value) add(value);
            }}
          >
            <option value="">Selecione…</option>
            {remaining.map(({ field, label }) => (
              <option key={field} value={field}>{label}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
          Todos os campos estão na visualização.
        </p>
      )}
    </div>
  );
}
