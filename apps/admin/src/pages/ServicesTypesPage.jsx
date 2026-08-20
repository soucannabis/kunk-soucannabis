import React, { useEffect, useMemo, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';

const EMPTY_TYPE = {
  id: '',
  label: '',
  association_fee: 0,
  default_consultation_price: '',
  active: true,
  sort: 100,
};

function slugifyTypeId(label, fallback = 'tipo') {
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

function uniqueTypeId(desired, existingIds) {
  const used = new Set((existingIds || []).map((id) => String(id)));
  if (!used.has(desired)) return desired;
  let n = 2;
  while (used.has(`${desired}_${n}`)) n += 1;
  return `${desired}_${n}`;
}

const EMPTY_BULK = {
  association_fee: '',
  default_consultation_price: '',
  touch_fee: false,
  touch_price: false,
  active: true,
  touch_active: false,
};

export function ServicesTypesPage({ api }) {
  const [types, setTypes] = useState([]);
  const [settings, setSettings] = useState({ deduct_donation_from_payable: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TYPE);
  const [isNew, setIsNew] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState(EMPTY_BULK);

  async function reload() {
    const [typesRes, settingsRes] = await Promise.all([
      api.getProfessionalTypes(),
      api.getServiceReportSettings(),
    ]);
    setTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
    setSettings(settingsRes.data || { deduct_donation_from_payable: false });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const sorted = useMemo(
    () =>
      [...types].sort(
        (a, b) => (a.sort || 0) - (b.sort || 0) || String(a.label).localeCompare(b.label, 'pt-BR')
      ),
    [types]
  );

  const selectedCount = selectedIds.length;
  const allSelected = sorted.length > 0 && selectedCount === sorted.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(sorted.map((t) => t.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function openBulkEdit() {
    setBulkForm(EMPTY_BULK);
    setBulkOpen(true);
    setError('');
    setMessage('');
  }

  function closeBulkEdit() {
    setBulkOpen(false);
    setBulkForm(EMPTY_BULK);
  }

  async function applyBulkActive(active) {
    if (!selectedIds.length) return;
    const selected = new Set(selectedIds);
    const next = types.map((t) => (selected.has(t.id) ? { ...t, active } : t));
    const ok = await saveTypes(next);
    if (!ok) return;
    setMessage(
      active
        ? `${selectedIds.length} tipo(s) ativado(s).`
        : `${selectedIds.length} tipo(s) desativado(s).`
    );
    clearSelection();
  }

  async function onSubmitBulk(e) {
    e.preventDefault();
    if (!selectedIds.length) return;
    if (!bulkForm.touch_fee && !bulkForm.touch_price && !bulkForm.touch_active) {
      setError('Marque ao menos um campo para alterar.');
      return;
    }
    const selected = new Set(selectedIds);
    const next = types.map((t) => {
      if (!selected.has(t.id)) return t;
      const row = { ...t };
      if (bulkForm.touch_fee) {
        row.association_fee = Number(bulkForm.association_fee) || 0;
      }
      if (bulkForm.touch_price) {
        row.default_consultation_price =
          bulkForm.default_consultation_price === '' ||
          bulkForm.default_consultation_price == null
            ? null
            : Number(bulkForm.default_consultation_price);
      }
      if (bulkForm.touch_active) {
        row.active = Boolean(bulkForm.active);
      }
      return row;
    });
    const ok = await saveTypes(next);
    if (!ok) return;
    setMessage(`${selectedIds.length} tipo(s) atualizado(s).`);
    closeBulkEdit();
    clearSelection();
  }

  function openNew() {
    setIsNew(true);
    setEditing('__new__');
    setForm({ ...EMPTY_TYPE, sort: (types.length + 1) * 10 });
    setMessage('');
    setError('');
  }

  function openEdit(row) {
    setIsNew(false);
    setEditing(row.id);
    setForm({
      id: row.id,
      label: row.label || '',
      association_fee: row.association_fee ?? 0,
      default_consultation_price:
        row.default_consultation_price == null ? '' : row.default_consultation_price,
      active: row.active !== false,
      sort: row.sort ?? 100,
    });
    setMessage('');
    setError('');
  }

  function closeForm() {
    setEditing(null);
    setForm(EMPTY_TYPE);
  }

  async function saveTypes(nextTypes) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api.putProfessionalTypes(nextTypes);
      setTypes(Array.isArray(res.data) ? res.data : nextTypes);
      setMessage('Tipos salvos.');
      closeForm();
      return true;
    } catch (err) {
      setError(err.message || 'Falha ao salvar tipos');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitType(e) {
    e.preventDefault();
    const label = String(form.label || '').trim();
    if (!label) {
      setError('Label é obrigatório');
      return;
    }

    let id = String(form.id || '').trim();
    if (isNew) {
      id = uniqueTypeId(
        slugifyTypeId(label),
        types.map((t) => t.id)
      );
    }
    if (!id) {
      setError('Não foi possível gerar o código a partir do label');
      return;
    }

    const row = {
      id,
      label,
      association_fee: Number(form.association_fee) || 0,
      default_consultation_price:
        form.default_consultation_price === '' || form.default_consultation_price == null
          ? null
          : Number(form.default_consultation_price),
      active: Boolean(form.active),
      sort: Number(form.sort) || 100,
    };
    const next = isNew ? [...types, row] : types.map((t) => (t.id === editing ? row : t));
    await saveTypes(next);
  }

  async function toggleActive(row) {
    const next = types.map((t) => (t.id === row.id ? { ...t, active: !t.active } : t));
    await saveTypes(next);
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api.putServiceReportSettings(settings);
      setSettings(res.data || settings);
      setMessage('Configuração do relatório salva.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminLoader />;

  return (
    <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 900 }}>
      <div>
        <h2 style={{ marginTop: 0 }}>Configuração de profissionais</h2>
        <p className="muted" style={{ margin: 0 }}>
          Taxas por tipo (valor retido pela associação) e preço padrão de consulta. Default do
          sistema: taxa 0 e doação não desconta o pagamento ao profissional.
        </p>
      </div>

      {error && !editing && !bulkOpen ? (
        <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p>
      ) : null}
      {message ? <p style={{ color: 'var(--admin-success, #2e7d32)', margin: 0 }}>{message}</p> : null}

      <form className="card" style={{ padding: '1.25rem' }} onSubmit={saveSettings}>
        <h3 style={{ marginTop: 0 }}>Relatório de serviços</h3>
        <label
          className={`ext-flag${settings.deduct_donation_from_payable ? ' ext-flag--active' : ''}`}
          data-testid="deduct-donation-toggle"
        >
          <input
            type="checkbox"
            checked={Boolean(settings.deduct_donation_from_payable)}
            onChange={(e) =>
              setSettings((s) => ({ ...s, deduct_donation_from_payable: e.target.checked }))
            }
          />
          <span className="ext-flag-body">
            <strong>Descontar doação do valor a pagar ao profissional</strong>
            <span className="muted">
              Se ligado: valor a receber = preço − taxa − doação. Default: desligado.
            </span>
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '0.75rem' }}>
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </form>

      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Tipos</h3>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            Novo tipo
          </button>
        </div>

        {selectedCount > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '1rem',
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
            }}
            data-testid="types-bulk-bar"
          >
            <span style={{ marginRight: '0.25rem', color: '#fff' }}>
              {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => applyBulkActive(true)}
            >
              Ativar
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => applyBulkActive(false)}
            >
              Desativar
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={openBulkEdit}>
              Alterar campos…
            </button>
            <button type="button" className="btn" disabled={saving} onClick={clearSelection}>
              Limpar seleção
            </button>
          </div>
        ) : null}

        <table className="data-table" style={{ width: '100%', marginTop: '1rem' }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'left', verticalAlign: 'middle', paddingLeft: '0.65rem' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Selecionar todos os tipos"
                  data-testid="types-select-all"
                />
              </th>
              <th>Label</th>
              <th>Taxa (R$)</th>
              <th>Preço padrão</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'left', verticalAlign: 'middle', paddingLeft: '0.65rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    aria-label={`Selecionar ${row.label}`}
                    data-testid={`type-select-${row.id}`}
                  />
                </td>
                <td>{row.label}</td>
                <td>{Number(row.association_fee || 0).toFixed(2)}</td>
                <td>
                  {row.default_consultation_price == null
                    ? '—'
                    : Number(row.default_consultation_price).toFixed(2)}
                </td>
                <td>{row.active === false ? 'Não' : 'Sim'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn" onClick={() => openEdit(row)}>
                    Editar
                  </button>{' '}
                  <button type="button" className="btn" onClick={() => toggleActive(row)}>
                    {row.active === false ? 'Ativar' : 'Desativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? 'Novo tipo' : 'Editar tipo'}
          onClick={() => !saving && closeForm()}
        >
          <form
            className="modal-card"
            style={{ display: 'grid', gap: '0.75rem' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmitType}
          >
            <h3 style={{ margin: 0 }}>{isNew ? 'Novo tipo' : 'Editar tipo'}</h3>
            {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}
            <label className="field">
              Label
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                required
                autoFocus
              />
            </label>
            <label className="field">
              Taxa da associação (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.association_fee}
                onChange={(e) => setForm((f) => ({ ...f, association_fee: e.target.value }))}
              />
            </label>
            <label className="field">
              Preço padrão da consulta (vazio = usa o do profissional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.default_consultation_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_consultation_price: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Ordem
              <input
                type="number"
                value={form.sort}
                onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
              />
            </label>
            <label
              className={`ext-flag${form.active ? ' ext-flag--active' : ''}`}
              data-testid="service-type-active-toggle"
            >
              <input
                type="checkbox"
                checked={Boolean(form.active)}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span className="ext-flag-body">
                <strong>Ativo</strong>
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={closeForm} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar tipo'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {bulkOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Alterar tipos em massa"
          onClick={() => !saving && closeBulkEdit()}
        >
          <form
            className="modal-card"
            style={{ display: 'grid', gap: '0.75rem' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmitBulk}
            data-testid="types-bulk-modal"
          >
            <h3 style={{ margin: 0 }}>
              Alterar {selectedCount} tipo{selectedCount === 1 ? '' : 's'}
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              Marque os campos que deseja aplicar aos selecionados. Os demais permanecem iguais.
            </p>
            {error ? <p style={{ color: 'var(--admin-danger)', margin: 0 }}>{error}</p> : null}

            <label
              className={`ext-flag${bulkForm.touch_fee ? ' ext-flag--active' : ''}`}
              data-testid="bulk-touch-fee"
            >
              <input
                type="checkbox"
                checked={bulkForm.touch_fee}
                onChange={(e) => setBulkForm((f) => ({ ...f, touch_fee: e.target.checked }))}
              />
              <span className="ext-flag-body">
                <strong>Taxa da associação (R$)</strong>
              </span>
            </label>
            <label className="field">
              <input
                type="number"
                min="0"
                step="0.01"
                value={bulkForm.association_fee}
                disabled={!bulkForm.touch_fee}
                onChange={(e) =>
                  setBulkForm((f) => ({ ...f, association_fee: e.target.value, touch_fee: true }))
                }
              />
            </label>

            <label
              className={`ext-flag${bulkForm.touch_price ? ' ext-flag--active' : ''}`}
              data-testid="bulk-touch-price"
            >
              <input
                type="checkbox"
                checked={bulkForm.touch_price}
                onChange={(e) => setBulkForm((f) => ({ ...f, touch_price: e.target.checked }))}
              />
              <span className="ext-flag-body">
                <strong>Preço padrão da consulta</strong>
                <span className="muted">Vazio = usa o do profissional</span>
              </span>
            </label>
            <label className="field">
              <input
                type="number"
                min="0"
                step="0.01"
                value={bulkForm.default_consultation_price}
                disabled={!bulkForm.touch_price}
                onChange={(e) =>
                  setBulkForm((f) => ({
                    ...f,
                    default_consultation_price: e.target.value,
                    touch_price: true,
                  }))
                }
              />
            </label>

            <label
              className={`ext-flag${bulkForm.touch_active ? ' ext-flag--active' : ''}`}
              data-testid="bulk-touch-active"
            >
              <input
                type="checkbox"
                checked={bulkForm.touch_active}
                onChange={(e) => setBulkForm((f) => ({ ...f, touch_active: e.target.checked }))}
              />
              <span className="ext-flag-body">
                <strong>Status ativo</strong>
              </span>
            </label>
            <label
              className={`ext-flag${bulkForm.active ? ' ext-flag--active' : ''}`}
              style={{ opacity: bulkForm.touch_active ? 1 : 0.5 }}
            >
              <input
                type="checkbox"
                checked={Boolean(bulkForm.active)}
                disabled={!bulkForm.touch_active}
                onChange={(e) =>
                  setBulkForm((f) => ({ ...f, active: e.target.checked, touch_active: true }))
                }
              />
              <span className="ext-flag-body">
                <strong>Ativo</strong>
              </span>
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={closeBulkEdit} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Aplicar aos selecionados'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
