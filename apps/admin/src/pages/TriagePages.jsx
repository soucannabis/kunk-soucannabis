import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  TRIAGE_DEFAULT_FORM_FIELDS,
  TRIAGE_DEFAULT_STATUSES,
  TRIAGE_STATUS_ICON_OPTIONS,
  normalizeTriageSelectOptions,
  triageSelectOptionLabels,
} from '@kunk/config';
import {
  getTriageEmbedSnippet,
  getTriagePublicUrl,
  loadTriageConfig,
  saveTriageConfig,
} from '../lib/triageConfig.js';
import { AdminLoader } from '../components/AdminLoader.jsx';
import { TriageFormLivePreview } from '../components/TriageFormLivePreview.jsx';

export function TriageShell() {
  return (
    <div>
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Triagem</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Formulário público, status da fila e módulos
          </p>
        </div>
      </div>
      <nav className="triage-subnav" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <NavLink to="/triagem/formulario" className={({ isActive }) => (isActive ? 'btn btn-primary' : 'btn')}>
          Formulário
        </NavLink>
        <NavLink to="/triagem/status" className={({ isActive }) => (isActive ? 'btn btn-primary' : 'btn')}>
          Status
        </NavLink>
        <NavLink to="/triagem/modulos" className={({ isActive }) => (isActive ? 'btn btn-primary' : 'btn')}>
          Módulos
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export function TriageIndexPage() {
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h2 style={{ marginTop: 0 }}>Área Triagem</h2>
      <ul style={{ lineHeight: 1.8 }}>
        <li><Link to="/triagem/formulario">Formulário público</Link> — campos, personalizados e publicação</li>
        <li><Link to="/triagem/status">Status da fila</Link> — Espera, Concluído e customizados</li>
        <li><Link to="/triagem/modulos">Módulos</Link> — documentos/dados do associado</li>
      </ul>
    </div>
  );
}

function useTriageForm(api) {
  const [values, setValues] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [itemsByKey, setItemsByKey] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadTriageConfig(api);
        if (cancelled) return;
        setValues(res.values);
        setBaseline(structuredClone(res.values));
        setItemsByKey(res.itemsByKey);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  async function save(next = values) {
    setSaving(true);
    setError('');
    try {
      const updated = await saveTriageConfig(api, next, baseline, itemsByKey);
      setItemsByKey(updated);
      setBaseline(structuredClone(next));
      setValues(next);
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return { values, setValues, baseline, itemsByKey, error, setError, saving, loaded, save };
}

function coerceSelectOptionsForEdit(options) {
  return (Array.isArray(options) ? options : []).map((o) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      return {
        label: String(o.label ?? o.value ?? ''),
        enabled: o.enabled !== false,
      };
    }
    return { label: String(o ?? ''), enabled: true };
  });
}

function SelectOptionsEditor({ options, onChange, min = 2 }) {
  // Não usar normalizeTriageSelectOptions aqui: o .trim() impede digitar espaços.
  const list = coerceSelectOptionsForEdit(options);

  function setOptionLabel(index, label) {
    onChange(list.map((opt, i) => (i === index ? { ...opt, label } : opt)));
  }

  function setOptionEnabled(index, enabled) {
    onChange(list.map((opt, i) => (i === index ? { ...opt, enabled } : opt)));
  }

  function addOption() {
    onChange([...list, { label: '', enabled: true }]);
  }

  function removeOption(index) {
    onChange(list.filter((_, i) => i !== index));
  }

  const activeCount = triageSelectOptionLabels(list).length;

  return (
    <div className="triage-options-editor">
      <p className="triage-options-editor__hint muted">
        Edite as opções do select. Mínimo de {min} valores preenchidos.
      </p>
      <ul className="triage-options-editor__list">
        {list.map((opt, index) => (
          <li
            key={`opt-${index}`}
            className={`triage-options-editor__row${opt.enabled ? '' : ' is-disabled'}`}
          >
            <input
              type="checkbox"
              checked={opt.enabled}
              onChange={(e) => setOptionEnabled(index, e.target.checked)}
              aria-label={`${opt.enabled ? 'Desativar' : 'Ativar'} opção ${index + 1}`}
            />
            <input
              type="text"
              className="triage-options-editor__input"
              value={opt.label}
              placeholder={`Opção ${index + 1}`}
              onChange={(e) => setOptionLabel(index, e.target.value)}
            />
            <button
              type="button"
              className="btn btn-danger triage-options-editor__remove"
              onClick={() => removeOption(index)}
              aria-label={`Remover opção ${index + 1}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn triage-options-editor__add" onClick={addOption}>
        Adicionar opção
      </button>
      {activeCount < min ? (
        <p className="triage-options-editor__error">
          Inclua pelo menos {min} opções preenchidas e marcadas.
        </p>
      ) : null}
    </div>
  );
}

function countSelectOptions(field) {
  return triageSelectOptionLabels(field?.options).length;
}

function sanitizeSelectOptions(options) {
  return normalizeTriageSelectOptions(options)
    .map((o) => ({ label: o.label, enabled: o.enabled }))
    .filter((o) => o.label);
}

function validateSelectOptions(values) {
  const fields = [
    ...(values.formFields || []).filter((f) => f && (f.type === 'select' || f.id === 'help_topic') && f.enabled !== false),
    ...(values.customFields || []).filter((f) => f && f.type === 'select' && f.enabled !== false),
  ];
  for (const field of fields) {
    if (countSelectOptions(field) < 2) {
      return `O select “${field.label || field.id}” precisa de pelo menos 2 opções.`;
    }
  }
  return '';
}

export function TriageFormPage({ api }) {
  const { values, setValues, error, setError, saving, loaded, save } = useTriageForm(api);
  const [copied, setCopied] = useState('');
  const publicUrl = useMemo(() => getTriagePublicUrl(), []);
  const theme = values?.formTheme === 'light' ? 'light' : 'dark';
  const embed = useMemo(() => getTriageEmbedSnippet(publicUrl, theme), [publicUrl, theme]);

  if (!loaded || !values) {
    if (error) return <p className="alert alert-error">{error}</p>;
    return <AdminLoader />;
  }

  function updateField(id, patch) {
    setValues((prev) => ({
      ...prev,
      formFields: prev.formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function addCustomField() {
    const id = `cf_${Date.now().toString(36)}`;
    setValues((prev) => ({
      ...prev,
      customFields: [
        ...prev.customFields,
        {
          id,
          label: 'Novo campo',
          type: 'text',
          required: false,
          enabled: true,
          order: 100 + prev.customFields.length,
          options: null,
        },
      ],
    }));
  }

  function updateCustom(id, patch) {
    setValues((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function removeCustom(id) {
    setValues((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
  }

  async function onCopy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Não foi possível copiar');
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const validationError = validateSelectOptions(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await save({
        ...values,
        formTheme: values.formTheme === 'light' ? 'light' : 'dark',
        formFields: (values.formFields || []).map((f) => (
          f.type === 'select' || f.id === 'help_topic'
            ? {
              ...f,
              type: 'select',
              options: sanitizeSelectOptions(f.options),
            }
            : f
        )),
        customFields: (values.customFields || []).map((f) => (
          f.type === 'select'
            ? {
              ...f,
              options: sanitizeSelectOptions(f.options),
            }
            : f
        )),
      });
    } catch {
      /* shown */
    }
  }

  return (
    <div className="triage-form-layout">
      {error ? <p className="triage-form-error" style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}

      <form onSubmit={onSubmit} className="card triage-form-main triage-admin">
        <section className="ext-card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <h2 style={{ margin: 0 }}>Formulário público</h2>
          <label
            className={`ext-flag${values.publicFormEnabled ? ' ext-flag--active' : ''}`}
            style={{ maxWidth: '100%' }}
          >
            <input
              type="checkbox"
              checked={Boolean(values.publicFormEnabled)}
              onChange={(e) => setValues((prev) => ({ ...prev, publicFormEnabled: e.target.checked }))}
            />
            <span className="ext-flag-body">
              <strong>Formulário público habilitado</strong>
              <span className="muted">Quando desligado, /contato e o iframe ficam indisponíveis.</span>
            </span>
          </label>
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Campos padrão</h2>
          <p className="muted">Desative para ocultar no formulário público. Campos do tipo select usam opções com checkbox.</p>
          <table className="data triage-fields-table">
            <thead>
              <tr>
                <th>Label</th>
                <th className="triage-fields-flags-col">Visível / Obrigatório</th>
              </tr>
            </thead>
            <tbody>
              {values.formFields.map((f) => (
                <React.Fragment key={f.id}>
                  <tr>
                    <td>
                      <input
                        type="text"
                        value={f.label || ''}
                        onChange={(e) => updateField(f.id, { label: e.target.value })}
                      />
                    </td>
                    <td className="triage-fields-flags-col">
                      <div className="triage-field-flags">
                        <label className="triage-field-flag">
                          <input
                            type="checkbox"
                            checked={f.enabled !== false}
                            onChange={(e) => updateField(f.id, { enabled: e.target.checked })}
                          />
                          <span>Visível</span>
                        </label>
                        <label className="triage-field-flag">
                          <input
                            type="checkbox"
                            checked={Boolean(f.required)}
                            onChange={(e) => updateField(f.id, { required: e.target.checked })}
                          />
                          <span>Obrigatório</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                  {f.id === 'help_topic' || f.type === 'select' ? (
                    <tr>
                      <td colSpan={2} className="triage-options-cell">
                        <SelectOptionsEditor
                          options={f.options || []}
                          onChange={(options) => updateField(f.id, { type: 'select', options })}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn"
            style={{ marginTop: '0.75rem' }}
            onClick={() => setValues((prev) => ({
              ...prev,
              formFields: TRIAGE_DEFAULT_FORM_FIELDS.map((f) => ({
                ...f,
                options: f.options ? [...f.options] : f.options,
              })),
            }))}
          >
            Restaurar campos padrão
          </button>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>Campos personalizados</h2>
            <button type="button" className="btn" onClick={addCustomField}>Adicionar</button>
          </div>
          {values.customFields.length === 0 ? (
            <p className="muted">Nenhum campo personalizado.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
              {values.customFields.map((f) => (
                <div key={f.id} className="card triage-custom-field">
                  <label className="field">
                    <span>Label</span>
                    <input type="text" value={f.label || ''} onChange={(e) => updateCustom(f.id, { label: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Tipo</span>
                    <select
                      value={f.type || 'text'}
                      onChange={(e) => updateCustom(f.id, {
                        type: e.target.value,
                        options: e.target.value === 'select'
                          ? (Array.isArray(f.options) && f.options.length ? f.options : ['Opção 1', 'Opção 2'])
                          : f.options,
                      })}
                    >
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="select">select</option>
                      <option value="checkbox">checkbox</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Ordem</span>
                    <input
                      type="number"
                      value={f.order ?? 0}
                      onChange={(e) => updateCustom(f.id, { order: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <div className="triage-field-flags field" style={{ marginBottom: '0.85rem' }}>
                    <label className="triage-field-flag">
                      <input type="checkbox" checked={f.enabled !== false} onChange={(e) => updateCustom(f.id, { enabled: e.target.checked })} />
                      <span>Visível</span>
                    </label>
                    <label className="triage-field-flag">
                      <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => updateCustom(f.id, { required: e.target.checked })} />
                      <span>Obrigatório</span>
                    </label>
                  </div>
                  {f.type === 'select' ? (
                    <div className="triage-options-cell" style={{ gridColumn: '1 / -1' }}>
                      <SelectOptionsEditor
                        options={f.options || []}
                        onChange={(options) => updateCustom(f.id, { options })}
                      />
                    </div>
                  ) : null}
                  <div>
                    <button type="button" className="btn btn-danger" onClick={() => removeCustom(f.id)}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ext-card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <h2 style={{ margin: 0 }}>Textos do formulário</h2>
          <p className="muted" style={{ margin: 0 }}>
            Título e subtítulo exibidos no formulário público e na mensagem após o envio.
          </p>
          <label className="field">
            <span>Título do formulário</span>
            <input
              type="text"
              value={values.formTitle || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, formTitle: e.target.value }))}
              placeholder="Fila de acolhimento"
            />
          </label>
          <label className="field">
            <span>Subtítulo do formulário</span>
            <input
              type="text"
              value={values.formSubtitle || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, formSubtitle: e.target.value }))}
              placeholder="Preencha para entrar na fila de contato do acolhimento"
            />
          </label>
          <label className="field">
            <span>Título após envio</span>
            <input
              type="text"
              value={values.successTitle || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, successTitle: e.target.value }))}
              placeholder="Você entrou na fila"
            />
          </label>
          <label className="field">
            <span>Subtítulo após envio</span>
            <input
              type="text"
              value={values.successSubtitle || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, successSubtitle: e.target.value }))}
              placeholder="Em breve a equipe de acolhimento entrará em contato."
            />
          </label>
        </section>

        <section className="ext-card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <h2 style={{ margin: 0 }}>Estilo do formulário</h2>
          <p className="muted" style={{ margin: 0 }}>
            Escolha o visual aplicado nas páginas públicas e no iframe incorporado.
          </p>
          <div className="ext-flags" style={{ display: 'grid', gap: '0.55rem' }}>
            <label className={`ext-flag${theme === 'dark' ? ' ext-flag--active' : ''}`}>
              <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={() => setValues((prev) => ({ ...prev, formTheme: 'dark' }))}
              />
              <span className="ext-flag-body">
                <strong>Padrão escuro</strong>
                <span className="muted">Fundo escuro, contraste alto (padrão atual)</span>
              </span>
            </label>
            <label className={`ext-flag${theme === 'light' ? ' ext-flag--active' : ''}`}>
              <input
                type="checkbox"
                checked={theme === 'light'}
                onChange={() => setValues((prev) => ({ ...prev, formTheme: 'light' }))}
              />
              <span className="ext-flag-body">
                <strong>Padrão claro</strong>
                <span className="muted">Fundo claro, tipografia escura</span>
              </span>
            </label>
          </div>
        </section>

        <section>
          <h2>Publicação / Incorporação</h2>
          <label className="field">
            <span>URL pública</span>
            <div>
              <input type="text" className="input-readonly" readOnly value={publicUrl} />
              <button type="button" className="btn" onClick={() => onCopy(publicUrl, 'url')}>
                {copied === 'url' ? 'Copiado' : 'Copiar link'}
              </button>
            </div>
          </label>
          <label className="field">
            <span>Código de incorporação (iframe)</span>
            <textarea readOnly rows={8} value={embed} style={{ fontFamily: 'var(--admin-mono)', fontSize: '0.85rem' }} />
            <button type="button" className="btn" style={{ marginTop: '0.5rem' }} onClick={() => onCopy(embed, 'embed')}>
              {copied === 'embed' ? 'Copiado' : 'Copiar código'}
            </button>
          </label>
        </section>

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar formulário'}
          </button>
        </div>
      </form>

      <aside className="triage-form-preview">
        <div className="triage-form-preview-head">
          <h2 style={{ margin: 0 }}>Pré-visualização</h2>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Atualiza ao alterar campos, textos, visibilidade, obrigatório e estilo (ainda não salvos).
            No botão “Entrar na fila” da prévia, veja a mensagem pós-envio.
          </p>
        </div>
        <TriageFormLivePreview values={values} />
      </aside>
    </div>
  );
}

export function TriageStatusPage({ api }) {
  const { values, setValues, error, setError, saving, loaded, save } = useTriageForm(api);

  if (!loaded || !values) {
    if (error) return <p className="alert alert-error">{error}</p>;
    return <AdminLoader />;
  }

  function slugifyStatusValue(label, fallback = 'status') {
    const base = String(label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return base || fallback;
  }

  function uniqueStatusValue(desired, excludeId, statuses) {
    const used = new Set(
      (statuses || [])
        .filter((s) => s.id !== excludeId)
        .map((s) => String(s.value || '')),
    );
    if (!used.has(desired)) return desired;
    let n = 2;
    while (used.has(`${desired}_${n}`)) n += 1;
    return `${desired}_${n}`;
  }

  function updateStatus(id, patch) {
    setValues((prev) => ({
      ...prev,
      statuses: prev.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function updateStatusLabel(id, label) {
    setValues((prev) => ({
      ...prev,
      statuses: prev.statuses.map((s) => {
        if (s.id !== id) return s;
        if (s.system) return { ...s, label };
        const desired = slugifyStatusValue(label, s.id);
        return {
          ...s,
          label,
          value: uniqueStatusValue(desired, id, prev.statuses),
        };
      }),
    }));
  }

  function addStatus() {
    const id = `st_${Date.now().toString(36)}`;
    setValues((prev) => {
      const label = 'Novo status';
      const value = uniqueStatusValue(slugifyStatusValue(label, id), id, prev.statuses);
      return {
        ...prev,
        statuses: [
          ...prev.statuses,
          {
            id,
            value,
            label,
            order: (prev.statuses.length + 1) * 10,
            is_default_entry: false,
            is_terminal: false,
            system: false,
            icon: 'AccessTime',
            color: '#5c6bc0',
          },
        ],
      };
    });
  }

  function removeStatus(id) {
    const target = values.statuses.find((s) => s.id === id);
    if (target?.system) {
      setError('Status de sistema não pode ser removido');
      return;
    }
    setValues((prev) => ({
      ...prev,
      statuses: prev.statuses.filter((s) => s.id !== id),
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const entry = values.statuses.filter((s) => s.is_default_entry);
    const terminal = values.statuses.filter((s) => s.is_terminal);
    if (entry.length !== 1 || terminal.length !== 1) {
      setError('Deve haver exatamente um status de entrada e um terminal');
      return;
    }
    const emptyLabel = values.statuses.some((s) => !String(s.label || '').trim());
    if (emptyLabel) {
      setError('Todos os status precisam de um nome');
      return;
    }
    try {
      await save();
    } catch {
      /* shown */
    }
  }

  return (
    <form onSubmit={onSubmit} className="card triage-admin" style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}>
      {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Status da fila</h2>
        <button type="button" className="btn" onClick={addStatus}>Adicionar status</button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Escolha um ícone padrão e a cor exibida na sidebar e no menu do avatar da triagem.
        O identificador interno é gerado automaticamente a partir do nome.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Ícone</th>
            <th>Cor</th>
            <th>Ordem</th>
            <th>Entrada</th>
            <th>Terminal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {values.statuses
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((s) => {
              const iconOpt = TRIAGE_STATUS_ICON_OPTIONS.find((o) => o.id === s.icon)
                || TRIAGE_STATUS_ICON_OPTIONS[0];
              const color = /^#[0-9a-fA-F]{3,8}$/.test(String(s.color || ''))
                ? s.color
                : '#5c6bc0';
              return (
                <tr key={s.id}>
                  <td>
                    <input
                      type="text"
                      value={s.label || ''}
                      onChange={(e) => updateStatusLabel(s.id, e.target.value)}
                      placeholder="Nome do status"
                      required
                    />
                  </td>
                  <td>
                    <div className="status-icon-picker">
                      <span
                        className="material-icons status-icon-preview"
                        style={{ color }}
                        aria-hidden
                      >
                        {iconOpt.material}
                      </span>
                      <select
                        value={s.icon || 'AccessTime'}
                        onChange={(e) => updateStatus(s.id, { icon: e.target.value })}
                        aria-label={`Ícone de ${s.label || s.value}`}
                      >
                        {TRIAGE_STATUS_ICON_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <div className="color-field-row status-color-field">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5c6bc0'}
                        onChange={(e) => updateStatus(s.id, { color: e.target.value })}
                        aria-label={`Cor de ${s.label || s.value}`}
                      />
                      <input
                        type="text"
                        value={s.color || ''}
                        onChange={(e) => updateStatus(s.id, { color: e.target.value })}
                        placeholder="#7A5B7A"
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={s.order ?? 0}
                      onChange={(e) => updateStatus(s.id, { order: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="entry"
                      checked={Boolean(s.is_default_entry)}
                      onChange={() => setValues((prev) => ({
                        ...prev,
                        statuses: prev.statuses.map((x) => ({
                          ...x,
                          is_default_entry: x.id === s.id,
                        })),
                      }))}
                    />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="terminal"
                      checked={Boolean(s.is_terminal)}
                      onChange={() => setValues((prev) => ({
                        ...prev,
                        statuses: prev.statuses.map((x) => ({
                          ...x,
                          is_terminal: x.id === s.id,
                        })),
                      }))}
                    />
                  </td>
                  <td>
                    {s.system ? (
                      <span className="muted">sistema</span>
                    ) : (
                      <button type="button" className="btn btn-danger" onClick={() => removeStatus(s.id)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <button
        type="button"
        className="btn"
        onClick={() => setValues((prev) => ({ ...prev, statuses: TRIAGE_DEFAULT_STATUSES.map((s) => ({ ...s })) }))}
      >
        Restaurar Espera + Concluído
      </button>
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar status'}
        </button>
      </div>
    </form>
  );
}

export function TriageModulesPage({ api }) {
  const { values, setValues, error, saving, loaded, save } = useTriageForm(api);

  if (!loaded || !values) {
    if (error) return <p className="alert alert-error">{error}</p>;
    return <AdminLoader />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await save();
    } catch {
      /* shown */
    }
  }

  const associateDocs = Boolean(values.associateDocs);

  return (
    <form onSubmit={onSubmit} className="triage-admin" style={{ display: 'grid', gap: '1rem', maxWidth: 640 }}>
      {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}

      <section className="ext-card" style={{ padding: '1.1rem', display: 'grid', gap: '0.85rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Módulos</h2>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Ative recursos opcionais da triagem operacional no Kunk.
          </p>
        </div>

        <label
          className={`ext-flag${associateDocs ? ' ext-flag--active' : ''}`}
          style={{ maxWidth: '100%' }}
          data-testid="triage-associate-docs-toggle"
        >
          <input
            type="checkbox"
            checked={associateDocs}
            onChange={(e) => setValues((prev) => ({ ...prev, associateDocs: e.target.checked }))}
          />
          <span className="ext-flag-body">
            <strong>Documentos / dados do associado</strong>
            <span className="muted">
              Exibe uma validação para verificar se algum documento obrigatório do associado está faltando
            </span>
          </span>
        </label>
      </section>

      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar módulos'}
        </button>
      </div>
    </form>
  );
}
