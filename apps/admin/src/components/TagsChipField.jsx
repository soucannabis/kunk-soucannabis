import React, { useEffect, useMemo, useState } from 'react';
import { normalizeTagLabels, serializeTagLabels } from '../lib/fieldWidgets.js';

/**
 * Editor de etiquetas em chips (add/remove), com sugestões do catálogo `tags`.
 */
export function TagsChipField({ api, collection, value, onChange, id }) {
  const [options, setOptions] = useState([]);
  const [draft, setDraft] = useState('');
  const [openSuggest, setOpenSuggest] = useState(false);

  const labels = useMemo(() => normalizeTagLabels(value), [value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listItems('tags', 'limit=200');
        const rows = res.data || [];
        const filtered = rows.filter((row) => {
          const ctx = String(row.contexts || '');
          if (!ctx.trim()) return true;
          return ctx
            .split(',')
            .map((s) => s.trim())
            .includes(collection);
        });
        if (!cancelled) {
          setOptions(
            filtered
              .map((r) => ({ label: r.tag, color: r.color }))
              .filter((o) => o.label)
          );
        }
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, collection]);

  function commit(nextLabels) {
    onChange(serializeTagLabels(nextLabels, value));
  }

  function addTag(raw) {
    const tag = String(raw || '').trim();
    if (!tag) return;
    if (labels.some((l) => l.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      setOpenSuggest(false);
      return;
    }
    commit([...labels, tag]);
    setDraft('');
    setOpenSuggest(false);
  }

  function removeTag(tag) {
    commit(labels.filter((l) => l !== tag));
  }

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return options
      .filter((o) => !labels.some((l) => l.toLowerCase() === o.label.toLowerCase()))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, labels, draft]);

  return (
    <div className="tags-chip-field" id={id}>
      <div className="chips tags-chip-list">
        {labels.map((tag) => {
          const meta = options.find((o) => o.label === tag);
          return (
            <span
              key={tag}
              className="chip tags-chip on"
              style={meta?.color ? { borderColor: meta.color, background: `${meta.color}33` } : undefined}
            >
              {tag}
              <button
                type="button"
                className="tags-chip-remove"
                aria-label={`Remover ${tag}`}
                onClick={() => removeTag(tag)}
              >
                ×
              </button>
            </span>
          );
        })}
        {!labels.length ? <span className="muted" style={{ fontSize: '0.85rem' }}>Nenhuma etiqueta</span> : null}
      </div>
      <div className="tags-chip-add">
        <input
          className="input"
          list={`${id}-suggest`}
          value={draft}
          placeholder="Adicionar etiqueta…"
          onChange={(e) => {
            setDraft(e.target.value);
            setOpenSuggest(true);
          }}
          onFocus={() => setOpenSuggest(true)}
          onBlur={() => {
            window.setTimeout(() => setOpenSuggest(false), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(draft);
            }
          }}
        />
        <button type="button" className="btn" onClick={() => addTag(draft)} disabled={!draft.trim()}>
          Adicionar
        </button>
      </div>
      {openSuggest && suggestions.length ? (
        <ul className="tags-chip-suggest" role="listbox">
          {suggestions.map((o) => (
            <li key={o.label}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(o.label)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
