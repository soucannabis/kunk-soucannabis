import React, { useEffect, useMemo, useState } from 'react';
import { triageSelectOptionLabels, TRIAGE_DEFAULT_COPY } from '@kunk/config';

const FIELD_LABEL_HINTS = {
  email: 'Se você já for associado, preencha o e-mail usado no seu cadastro.',
  phone: 'Entraremos em contato por WhatsApp',
};

function fieldType(field) {
  if (field.type) return field.type;
  if (field.id === 'message') return 'textarea';
  if (field.id === 'help_topic') return 'select';
  if (field.id === 'is_associate') return 'checkbox';
  return 'text';
}

function FieldLabel({ field, mark }) {
  const hint = FIELD_LABEL_HINTS[field.id];
  return (
    <span className="triage-live-field-label">
      <span className="triage-live-field-label-text">{field.label || field.id}{mark}</span>
      {hint ? <span className="triage-live-field-hint">{hint}</span> : null}
    </span>
  );
}

function PreviewField({ field, value, onChange }) {
  const type = fieldType(field);
  const required = Boolean(field.required);
  const mark = required ? ' *' : '';
  const options = triageSelectOptionLabels(field.options);

  if (type === 'checkbox') {
    return (
      <label className="triage-live-field triage-live-check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label || field.id}{mark}</span>
      </label>
    );
  }

  if (type === 'textarea') {
    return (
      <label className="triage-live-field">
        <FieldLabel field={field} mark={mark} />
        <textarea
          rows={4}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (type === 'select') {
    return (
      <label className="triage-live-field">
        <FieldLabel field={field} mark={mark} />
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecione…</option>
          {(options.length ? options : ['Outro']).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="triage-live-field">
      <FieldLabel field={field} mark={mark} />
      <input
        type={field.id === 'email' ? 'email' : field.id === 'phone' ? 'tel' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Agrupa nome/sobrenome em linha de 2 colunas; demais campos em largura total. */
function groupFieldsForLayout(fields) {
  const pairOrder = ['name', 'last_name'];
  const pairGroups = [
    new Set(['name', 'last_name']),
  ];
  const consumed = new Set();
  const rows = [];

  for (const field of fields) {
    if (consumed.has(field.id)) continue;
    const group = pairGroups.find((g) => g.has(field.id));
    if (group) {
      const pairFields = fields.filter((f) => group.has(f.id));
      if (pairFields.length === 2) {
        const ordered = [...pairFields].sort(
          (a, b) => pairOrder.indexOf(a.id) - pairOrder.indexOf(b.id),
        );
        rows.push({
          key: ordered.map((f) => f.id).join('-'),
          fields: ordered,
          columns: 2,
        });
        ordered.forEach((f) => consumed.add(f.id));
        continue;
      }
    }
    rows.push({ key: `${field.source}-${field.id}`, fields: [field], columns: 1 });
    consumed.add(field.id);
  }

  return rows;
}

export function TriageFormLivePreview({ values }) {
  const theme = values?.formTheme === 'light' ? 'light' : 'dark';
  const enabled = values?.publicFormEnabled !== false;
  const [form, setForm] = useState({});
  const [previewDone, setPreviewDone] = useState(false);

  const formTitle = String(values?.formTitle || '').trim() || TRIAGE_DEFAULT_COPY.formTitle;
  const formSubtitle = String(values?.formSubtitle || '').trim() || TRIAGE_DEFAULT_COPY.formSubtitle;
  const successTitle = String(values?.successTitle || '').trim() || TRIAGE_DEFAULT_COPY.successTitle;
  const successSubtitle =
    String(values?.successSubtitle || '').trim() || TRIAGE_DEFAULT_COPY.successSubtitle;

  const fields = useMemo(() => {
    const standard = (values?.formFields || [])
      .filter((f) => f && f.enabled !== false)
      .map((f) => ({ ...f, source: 'standard' }));
    const custom = (values?.customFields || [])
      .filter((f) => f && f.enabled !== false)
      .map((f) => ({ ...f, source: 'custom' }));
    return [...standard, ...custom].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [values?.formFields, values?.customFields]);

  useEffect(() => {
    setPreviewDone(false);
  }, [formTitle, formSubtitle, successTitle, successSubtitle, enabled, fields.length]);

  function updateField(id, value) {
    setForm((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <div className={`triage-live-preview triage-live-theme-${theme}`}>
      <div className="triage-live-card">
        {!enabled ? (
          <p className="triage-live-error">Formulário temporariamente indisponível.</p>
        ) : previewDone ? (
          <div className="triage-live-success">
            <h2>{successTitle}</h2>
            <p className="triage-live-muted">{successSubtitle}</p>
            <button
              className="triage-live-btn"
              type="button"
              onClick={() => setPreviewDone(false)}
            >
              Voltar ao formulário
            </button>
          </div>
        ) : (
          <>
            <h1>{formTitle}</h1>
            <p className="triage-live-muted">{formSubtitle}</p>
            <div className="triage-live-form">
              {fields.length === 0 ? (
                <p className="triage-live-muted">Nenhum campo visível.</p>
              ) : null}
              {groupFieldsForLayout(fields).map((row) => (
                <div
                  key={row.key}
                  className={`triage-live-row${row.columns === 2 ? ' triage-live-row--2' : ''}`}
                >
                  {row.fields.map((field) => (
                    <PreviewField
                      key={`${field.source}-${field.id}`}
                      field={field}
                      value={form[field.id]}
                      onChange={(v) => updateField(field.id, v)}
                    />
                  ))}
                </div>
              ))}
              <button
                className="triage-live-btn"
                type="button"
                disabled={fields.length === 0}
                onClick={() => setPreviewDone(true)}
              >
                Entrar na fila
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
