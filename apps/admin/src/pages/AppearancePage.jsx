import React, { useEffect, useState } from 'react';
import { KUNK_APPEARANCE_DEFAULTS } from '@kunk/config';
import {
  loadKunkAppearance,
  saveKunkAppearance,
  uploadAppearanceAsset,
} from '../lib/kunkAppearanceConfig.js';
import { AdminLoader } from '../components/AdminLoader.jsx';

function ColorField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="color-field-row">
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
        />
      </div>
    </label>
  );
}

function normalizeHex(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#000000';
}

function ImageField({ label, value, onChange, onPersist, api, onError }) {
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    onError('');
    try {
      const url = await uploadAppearanceAsset(api, file);
      await onPersist(url);
    } catch (err) {
      onError(err.message || 'Falha no upload');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span>{label}</span>
      {value ? (
        <div className="appearance-preview">
          <img src={value} alt="" />
        </div>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/api/v1/files/…/download ou URL"
      />
      <div className="appearance-upload-row">
        <label className="btn">
          {busy ? 'Enviando…' : 'Upload'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
        </label>
        {value ? (
          <button type="button" className="btn" onClick={() => onPersist('')}>
            Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AppearancePage({ api }) {
  const [form, setForm] = useState({ ...KUNK_APPEARANCE_DEFAULTS });
  const [baseline, setBaseline] = useState({ ...KUNK_APPEARANCE_DEFAULTS });
  const [itemsByKey, setItemsByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { values, itemsByKey: items } = await loadKunkAppearance(api);
        if (cancelled) return;
        setForm(values);
        setBaseline(values);
        setItemsByKey(items);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar aparência');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage('');
  }

  async function persistAssetField(prop, url) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextForm = { ...form, [prop]: url };
      const nextItems = await saveKunkAppearance(api, nextForm, baseline, itemsByKey);
      setForm(nextForm);
      setItemsByKey(nextItems);
      setBaseline((prev) => ({ ...prev, [prop]: url }));
      setMessage('Imagem de fundo salva.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar arquivo de aparência');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextItems = await saveKunkAppearance(api, form, baseline, itemsByKey);
      setItemsByKey(nextItems);
      setBaseline({ ...form });
      setMessage('Aparência salva.');
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  function onResetDefaults() {
    setForm((prev) => ({
      ...KUNK_APPEARANCE_DEFAULTS,
      title: prev.title,
      logo: prev.logo,
    }));
    setMessage('');
  }

  if (loading) {
    return <AdminLoader label="Carregando aparência…" />;
  }

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Aparência</h1>
          <p className="muted">
            Fundo do sistema, menu e cores dos temas claro e escuro. Logo e título ficam em Dados da
            associação.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-info">{message}</div> : null}

      <form className="card appearance-form" onSubmit={onSubmit}>
        <h2>Fundo do sistema</h2>
        <div className="field">
          <span>Modo</span>
          <div className="appearance-radio-row">
            <label>
              <input
                type="radio"
                name="bgMode"
                checked={form.bgMode === 'color'}
                onChange={() => setField('bgMode', 'color')}
              />
              Cor (temas)
            </label>
            <label>
              <input
                type="radio"
                name="bgMode"
                checked={form.bgMode === 'image'}
                onChange={() => setField('bgMode', 'image')}
              />
              Imagem
            </label>
          </div>
          {form.bgMode === 'color' ? (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              As cores de fundo são definidas nas seções Tema escuro e Tema claro abaixo.
            </p>
          ) : null}
        </div>
        {form.bgMode === 'image' ? (
          <ImageField
            label="Imagem de fundo"
            value={form.bgImage}
            onChange={(v) => setField('bgImage', v)}
            onPersist={(v) => persistAssetField('bgImage', v)}
            api={api}
            onError={setError}
          />
        ) : null}

        <h2>Menu</h2>
        <div className="grid-2">
          <ColorField label="Fundo" value={form.menuBg} onChange={(v) => setField('menuBg', v)} />
          <ColorField label="Texto" value={form.menuText} onChange={(v) => setField('menuText', v)} />
          <ColorField
            label="Hover fundo"
            value={form.menuHoverBg}
            onChange={(v) => setField('menuHoverBg', v)}
          />
          <ColorField
            label="Hover texto"
            value={form.menuHoverText}
            onChange={(v) => setField('menuHoverText', v)}
          />
        </div>
        <div
          className="menu-preview"
          style={{
            background: form.menuBg,
            color: form.menuText,
            '--preview-hover-bg': form.menuHoverBg,
            '--preview-hover-text': form.menuHoverText,
          }}
        >
          <div className="menu-preview-item">Item do menu</div>
        </div>

        <h2>Tema padrão</h2>
        <label className="field">
          <span>Modo inicial (sem preferência do usuário)</span>
          <select
            value={form.defaultTheme}
            onChange={(e) => setField('defaultTheme', e.target.value)}
          >
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
          </select>
        </label>

        <h2>Tema escuro</h2>
        <div className="grid-2">
          <ColorField label="Fundo" value={form.darkBg} onChange={(v) => setField('darkBg', v)} />
          <ColorField
            label="Verde (primary)"
            value={form.darkPrimary}
            onChange={(v) => setField('darkPrimary', v)}
          />
          <ColorField
            label="Roxo (accent)"
            value={form.darkAccent}
            onChange={(v) => setField('darkAccent', v)}
          />
          <ColorField
            label="Hover do accent"
            value={form.darkAccentHover}
            onChange={(v) => setField('darkAccentHover', v)}
          />
        </div>

        <h2>Tema claro</h2>
        <div className="grid-2">
          <ColorField label="Fundo" value={form.lightBg} onChange={(v) => setField('lightBg', v)} />
          <ColorField
            label="Verde (primary)"
            value={form.lightPrimary}
            onChange={(v) => setField('lightPrimary', v)}
          />
          <ColorField
            label="Roxo (accent)"
            value={form.lightAccent}
            onChange={(v) => setField('lightAccent', v)}
          />
          <ColorField
            label="Hover do accent"
            value={form.lightAccentHover}
            onChange={(v) => setField('lightAccentHover', v)}
          />
        </div>

        <div className="appearance-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="btn" onClick={onResetDefaults} disabled={busy}>
            Restaurar defaults
          </button>
        </div>
      </form>
    </div>
  );
}
