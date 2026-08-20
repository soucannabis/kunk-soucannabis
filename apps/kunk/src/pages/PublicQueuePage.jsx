import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createApiClient } from '@kunk/api-client';
import { isValidEmail, isValidPhoneBr, PhoneInput } from '@kunk/forms';
import { useErrorModal } from '../components/errors/ErrorModalProvider.jsx';
import { getKunkPublicConfig, TRIAGE_DEFAULT_COPY } from '@kunk/config';

const FIELD_LABEL_HINTS = {
  email: 'Se você já for associado, preencha o e-mail usado no seu cadastro.',
  phone: 'Entraremos em contato por WhatsApp',
};

function FieldLabel({ field, requiredMark }) {
  const hint = FIELD_LABEL_HINTS[field.id];
  return (
    <span className="fila-field-label">
      <span className="fila-field-label-text">{field.label}{requiredMark}</span>
      {hint ? <span className="fila-field-hint">{hint}</span> : null}
    </span>
  );
}

function FieldInput({ field, value, onChange, error }) {
  const id = `fila-${field.id}`;
  const type = field.type
    || (field.id === 'is_associate' ? 'checkbox'
      : field.id === 'message' ? 'textarea'
        : field.id === 'help_topic' ? 'select'
          : 'text');
  const options = (Array.isArray(field.options) ? field.options : [])
    .map((o) => {
      if (o && typeof o === 'object') {
        if (o.enabled === false) return '';
        return String(o.label ?? o.value ?? '').trim();
      }
      return String(o || '').trim();
    })
    .filter(Boolean);
  const requiredMark = ' *';

  if (type === 'checkbox') {
    return (
      <label className={`fila-field fila-check${error ? ' fila-field-invalid' : ''}`}>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          required
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label}{requiredMark}</span>
        {error ? <span className="fila-field-error">{error}</span> : null}
      </label>
    );
  }

  if (type === 'textarea' || field.id === 'message') {
    return (
      <label className={`fila-field${error ? ' fila-field-invalid' : ''}`}>
        <FieldLabel field={field} requiredMark={requiredMark} />
        <textarea
          id={id}
          rows={4}
          value={value || ''}
          required
          onChange={(e) => onChange(e.target.value)}
        />
        {error ? <span className="fila-field-error">{error}</span> : null}
      </label>
    );
  }

  if (type === 'select') {
    return (
      <label className={`fila-field${error ? ' fila-field-invalid' : ''}`}>
        <FieldLabel field={field} requiredMark={requiredMark} />
        <select
          id={id}
          value={value || ''}
          required
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecione…</option>
          {(options.length ? options : ['Outro']).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {error ? <span className="fila-field-error">{error}</span> : null}
      </label>
    );
  }

  if (field.id === 'phone') {
    return (
      <div className={`fila-field${error ? ' fila-field-invalid' : ''}`}>
        <FieldLabel field={field} requiredMark={requiredMark} />
        <PhoneInput
          value={value || ''}
          onChange={onChange}
          invalid={Boolean(error)}
          inputClass="fila-phone-input"
          className="fila-phone"
          inputProps={{
            id,
            name: 'phone',
            required: true,
            autoComplete: 'tel',
          }}
        />
        {error ? <span className="fila-field-error">{error}</span> : null}
      </div>
    );
  }

  return (
    <label className={`fila-field${error ? ' fila-field-invalid' : ''}`}>
      <FieldLabel field={field} requiredMark={requiredMark} />
      <input
        id={id}
        type={field.id === 'email' ? 'email' : 'text'}
        value={value || ''}
        required
        autoComplete={field.id === 'email' ? 'email' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className="fila-field-error">{error}</span> : null}
    </label>
  );
}

function validateForm(fields, form) {
  const errors = {};
  for (const field of fields) {
    const value = form[field.id];
    const empty = value === undefined || value === null || String(value).trim() === '';
    if (empty && value !== false) {
      errors[field.id] = `${field.label || field.id} é obrigatório`;
      continue;
    }
    if (field.id === 'email' && !isValidEmail(value)) {
      errors[field.id] = 'Informe um e-mail válido';
    }
    if (field.id === 'phone' && !isValidPhoneBr(value)) {
      errors[field.id] = 'Informe um telefone válido';
    }
  }
  return errors;
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
    rows.push({ key: field.id, fields: [field], columns: 1 });
    consumed.add(field.id);
  }

  return rows;
}

export default function PublicQueuePage() {
  const [searchParams] = useSearchParams();
  const embed = searchParams.get('embed') === '1';
  const bootstrap = useMemo(() => getKunkPublicConfig(), []);
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);

  const [fields, setFields] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [copy, setCopy] = useState(TRIAGE_DEFAULT_COPY);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showError } = useErrorModal();
  const [done, setDone] = useState(false);

  const queryTheme = String(searchParams.get('theme') || '').trim().toLowerCase();
  const activeTheme = queryTheme === 'light' || queryTheme === 'dark'
    ? queryTheme
    : (theme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.receptionFormSchema();
        if (cancelled) return;
        setEnabled(res.data?.enabled !== false);
        setTheme(res.data?.theme === 'light' ? 'light' : 'dark');
        setCopy({
          formTitle: String(res.data?.title || '').trim() || TRIAGE_DEFAULT_COPY.formTitle,
          formSubtitle: String(res.data?.subtitle || '').trim() || TRIAGE_DEFAULT_COPY.formSubtitle,
          successTitle: String(res.data?.success_title || '').trim() || TRIAGE_DEFAULT_COPY.successTitle,
          successSubtitle:
            String(res.data?.success_subtitle || '').trim() || TRIAGE_DEFAULT_COPY.successSubtitle,
        });
        const nextFields = (res.data?.fields || []).map((f) => ({ ...f, required: true }));
        setFields(nextFields);
        const initial = {};
        for (const f of nextFields) {
          initial[f.id] = f.type === 'checkbox' || f.id === 'is_associate' ? false : '';
        }
        setForm(initial);
        setFieldErrors({});
      } catch (err) {
        if (!cancelled) showError(err.message || 'Falha ao carregar formulário');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, showError]);

  useEffect(() => {
    if (!embed) return undefined;

    function publishHeight() {
      const height = Math.ceil(
        Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
          document.querySelector('.fila-page')?.scrollHeight || 0,
        ),
      );
      if (!height) return;
      window.parent?.postMessage(
        { source: 'kunk-triage-embed', type: 'resize', height, theme: activeTheme },
        '*',
      );
    }

    publishHeight();
    const raf = window.requestAnimationFrame(publishHeight);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => publishHeight())
      : null;
    const root = document.querySelector('.fila-page');
    if (ro && root) ro.observe(root);
    window.addEventListener('load', publishHeight);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('load', publishHeight);
      ro?.disconnect();
    };
  }, [embed, loading, done, fields, fieldErrors, enabled, activeTheme, copy]);

  function updateField(id, value) {
    setForm((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function scrollPageToTop(doneFlag = false) {
    if (embed) {
      window.parent?.postMessage(
        { source: 'kunk-triage-embed', type: 'scroll-top', done: Boolean(doneFlag) },
        '*',
      );
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const errors = validateForm(fields, form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showError(Object.values(errors)[0]);
      return;
    }
    scrollPageToTop(false);
    setSubmitting(true);
    try {
      await api.createPublicReception(form);
      setDone(true);
      scrollPageToTop(true);
    } catch (err) {
      showError(err.message || 'Não foi possível enviar');
    } finally {
      setSubmitting(false);
    }
  }

  const isLight = activeTheme === 'light';

  return (
    <div className={`fila-page${embed ? ' fila-embed' : ''}${isLight ? ' fila-theme-light' : ' fila-theme-dark'}`}>
      <style>{`
        .fila-page {
          min-height: 100vh;
          box-sizing: border-box;
          padding: 2rem 1rem;
          font-family: var(--kunk-font-sans, "IBM Plex Sans", "Segoe UI", sans-serif);
        }
        .fila-theme-dark {
          background: linear-gradient(160deg, #1a2a1c 0%, #0f1410 55%, #1a1520 100%);
          color: #e8efe9;
          color-scheme: dark;
        }
        .fila-theme-light {
          background: linear-gradient(160deg, #f5f7f5 0%, #eef1ef 55%, #f7f8f9 100%);
          color: #1a241c;
          color-scheme: light;
        }
        .fila-embed { min-height: auto; padding: 0; overflow: hidden; background: transparent !important; }
        .fila-theme-dark.fila-embed,
        .fila-theme-light.fila-embed { background: transparent !important; }
        .fila-embed .fila-card {
          max-width: none;
          margin: 0;
        }
        .fila-card {
          max-width: 520px;
          margin: 0 auto;
          border-radius: 12px;
          padding: 1.5rem;
        }
        .fila-theme-dark .fila-card {
          background: rgba(26, 34, 28, 0.92);
          border: 0;
          box-shadow: none;
        }
        .fila-theme-light .fila-card {
          background: #fff;
          border: 0;
          box-shadow: none;
        }
        .fila-card h1 { margin: 0 0 0.35rem; font-size: 1.5rem; text-align: center; }
        .fila-card h1.fila-title-embed { font-size: 1.2rem; }
        .fila-intro { text-align: center; }
        .fila-muted { margin: 0 0 1.25rem; }
        .fila-muted.fila-intro { margin-bottom: 2.5rem; }
        .fila-theme-dark .fila-muted { color: #9aab9e; }
        .fila-theme-light .fila-muted { color: #5d6b60; }
        .fila-field { display: grid; gap: 0.35rem; margin-bottom: 0.9rem; }
        .fila-row {
          display: grid;
          gap: 0.75rem;
          margin-bottom: 0;
        }
        .fila-row--2 {
          grid-template-columns: 1fr 1fr;
        }
        .fila-row .fila-field { margin-bottom: 0.9rem; }
        @media (max-width: 520px) {
          .fila-row--2 { grid-template-columns: 1fr; }
        }
        .fila-field-label {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.35rem 0.55rem;
          font-size: 0.9rem;
        }
        .fila-theme-dark .fila-field-label-text { color: #fff; }
        .fila-theme-light .fila-field-label-text { color: #4d5b51; }
        .fila-field-hint {
          font-size: 0.75rem;
          font-weight: 400;
          line-height: 1.3;
        }
        .fila-theme-dark .fila-field-hint { color: rgba(255, 255, 255, 0.75); }
        .fila-theme-light .fila-field-hint { color: #6a786d; }
        .fila-field > span { font-size: 0.9rem; }
        .fila-theme-dark .fila-field > span { color: #fff; }
        .fila-theme-light .fila-field > span { color: #4d5b51; }
        .fila-field input, .fila-field textarea, .fila-field select {
          width: 100%; box-sizing: border-box; border-radius: 8px;
          padding: 0.65rem 0.75rem; font: inherit;
        }
        .fila-theme-dark .fila-field input,
        .fila-theme-dark .fila-field textarea,
        .fila-theme-dark .fila-field select {
          border: 1px solid #2d3b30; background: #0f1410; color: #e8efe9;
        }
        .fila-theme-light .fila-field input,
        .fila-theme-light .fila-field textarea,
        .fila-theme-light .fila-field select {
          border: 1px solid #c9d2cb; background: #fff; color: #1a241c;
        }
        .fila-theme-dark .fila-field input:focus,
        .fila-theme-dark .fila-field input:focus-visible,
        .fila-theme-dark .fila-field textarea:focus,
        .fila-theme-dark .fila-field textarea:focus-visible,
        .fila-theme-dark .fila-field select:focus,
        .fila-theme-dark .fila-field select:focus-visible {
          border: 1px solid #2d3b30 !important;
          outline: none;
          box-shadow: none;
        }
        .fila-theme-light .fila-field input:focus,
        .fila-theme-light .fila-field input:focus-visible,
        .fila-theme-light .fila-field textarea:focus,
        .fila-theme-light .fila-field textarea:focus-visible,
        .fila-theme-light .fila-field select:focus,
        .fila-theme-light .fila-field select:focus-visible {
          border: 1px solid #c9d2cb !important;
          outline: none;
          box-shadow: none;
        }
        .fila-theme-light .fila-field input:-webkit-autofill,
        .fila-theme-light .fila-field input:-webkit-autofill:hover,
        .fila-theme-light .fila-field input:-webkit-autofill:focus,
        .fila-theme-light .fila-field textarea:-webkit-autofill,
        .fila-theme-light .fila-field textarea:-webkit-autofill:hover,
        .fila-theme-light .fila-field textarea:-webkit-autofill:focus {
          -webkit-text-fill-color: #1a241c;
          caret-color: #1a241c;
          box-shadow: 0 0 0 1000px #fff inset;
          border: 1px solid #c9d2cb !important;
          transition: background-color 99999s ease-out;
        }
        .fila-field-invalid input,
        .fila-field-invalid textarea,
        .fila-field-invalid select,
        .fila-field-invalid .fila-phone-input {
          border-color: #c66 !important;
        }
        .fila-field-error { font-size: 0.8rem; color: #c44; }
        .fila-theme-dark .fila-field-error { color: #e88; }
        .fila-check { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .fila-check input { width: auto; }
        .fila-phone { width: 100%; }
        .fila-phone .fila-phone-input {
          width: 100% !important;
          height: 42px !important;
          box-sizing: border-box !important;
          border-radius: 0 8px 8px 0 !important;
          font: inherit !important;
        }
        .fila-theme-dark .fila-phone .fila-phone-input {
          border: 1px solid #2d3b30 !important;
          background: #0f1410 !important;
          color: #e8efe9 !important;
        }
        .fila-theme-light .fila-phone .fila-phone-input {
          border: 1px solid #c9d2cb !important;
          background: #fff !important;
          color: #1a241c !important;
        }
        .fila-theme-dark .fila-phone .fila-phone-input:focus,
        .fila-theme-dark .fila-phone .fila-phone-input:focus-visible {
          border: 1px solid #2d3b30 !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .fila-theme-light .fila-phone .fila-phone-input:focus,
        .fila-theme-light .fila-phone .fila-phone-input:focus-visible {
          border: 1px solid #c9d2cb !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .fila-phone .flag-dropdown,
        .fila-phone .kunk-phone-flag-btn {
          border-radius: 8px 0 0 8px !important;
        }
        .fila-theme-dark .fila-phone .flag-dropdown,
        .fila-theme-dark .fila-phone .kunk-phone-flag-btn {
          background: #0f1410 !important;
          border: 1px solid #2d3b30 !important;
        }
        .fila-theme-light .fila-phone .flag-dropdown,
        .fila-theme-light .fila-phone .kunk-phone-flag-btn {
          background: #fff !important;
          border: 1px solid #c9d2cb !important;
        }
        .fila-theme-dark .fila-phone .selected-flag:hover,
        .fila-theme-dark .fila-phone .selected-flag:focus,
        .fila-theme-dark .fila-phone .selected-flag.open {
          background: #142018 !important;
        }
        .fila-theme-light .fila-phone .selected-flag:hover,
        .fila-theme-light .fila-phone .selected-flag:focus,
        .fila-theme-light .fila-phone .selected-flag.open {
          background: #eef2ef !important;
        }
        .fila-phone .country-list,
        .fila-phone .kunk-phone-dropdown {
          z-index: 30 !important;
        }
        .fila-theme-dark .fila-phone .country-list,
        .fila-theme-dark .fila-phone .kunk-phone-dropdown {
          background: #142018 !important;
          color: #e8efe9 !important;
          border: 1px solid #2d3b30 !important;
        }
        .fila-theme-light .fila-phone .country-list,
        .fila-theme-light .fila-phone .kunk-phone-dropdown {
          background: #fff !important;
          color: #1a241c !important;
          border: 1px solid #c9d2cb !important;
        }
        .fila-theme-dark .fila-phone .country-list .country:hover,
        .fila-theme-dark .fila-phone .country-list .country.highlight {
          background: #1a2a1c !important;
        }
        .fila-theme-light .fila-phone .country-list .country:hover,
        .fila-theme-light .fila-phone .country-list .country.highlight {
          background: #eef2ef !important;
        }
        .fila-theme-dark .fila-phone .search-box {
          background: #0f1410 !important;
          color: #e8efe9 !important;
          border: 1px solid #2d3b30 !important;
        }
        .fila-theme-light .fila-phone .search-box {
          background: #fff !important;
          color: #1a241c !important;
          border: 1px solid #c9d2cb !important;
        }
        .fila-btn {
          width: 100%; border: 0; border-radius: 8px; padding: 0.85rem 1rem;
          background: #5a8f5e; color: #0f1410; font-size: 1.1rem; font-weight: 700; cursor: pointer;
        }
        .fila-theme-light .fila-btn {
          background: #2e7d32;
          color: #fff;
        }
        .fila-btn:disabled { opacity: 0.6; cursor: wait; }
        .fila-error { margin-bottom: 0.75rem; }
        .fila-theme-dark .fila-error { color: #e88; }
        .fila-theme-light .fila-error { color: #b33; }
        .fila-success { text-align: center; padding: 1rem 0; }
      `}</style>
      <div className="fila-card">
        {!done ? (
          <h1 className={embed ? 'fila-title-embed' : undefined}>{copy.formTitle}</h1>
        ) : null}
        {!loading && enabled && !done ? (
          <p className="fila-muted fila-intro">
            {copy.formSubtitle}
          </p>
        ) : null}

        {loading ? <p className="fila-muted">Carregando…</p> : null}
        {!loading && !enabled ? (
          <p className="fila-error">Formulário temporariamente indisponível.</p>
        ) : null}
        {!loading && enabled && done ? (
          <div className="fila-success">
            <h2 style={{ marginTop: 0 }}>{copy.successTitle}</h2>
            <p className="fila-muted">{copy.successSubtitle}</p>
          </div>
        ) : null}
        {!loading && enabled && !done ? (
          <form onSubmit={onSubmit} noValidate>
            {groupFieldsForLayout(fields).map((row) => (
              <div
                key={row.key}
                className={`fila-row${row.columns === 2 ? ' fila-row--2' : ''}`}
              >
                {row.fields.map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={form[field.id]}
                    error={fieldErrors[field.id]}
                    onChange={(v) => updateField(field.id, v)}
                  />
                ))}
              </div>
            ))}
            <button className="fila-btn" type="submit" disabled={submitting || fields.length === 0}>
              {submitting ? 'Enviando…' : 'Entrar na fila'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
