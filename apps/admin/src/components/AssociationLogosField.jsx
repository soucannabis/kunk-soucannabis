import React, { useEffect, useState } from 'react';
import {
  BRANDING_APPS,
  BRANDING_APP_LABELS,
  BRANDING_SURFACES,
  BRANDING_SURFACE_LABELS,
  LOGO_FORMAT_RECTANGULAR,
  LOGO_FORMAT_SQUARE,
  LOGO_WIDTH_MAX,
  LOGO_WIDTH_MIN,
  clampLogoWidth,
  normalizeLogoPlacements,
  resolveBrandingLogoUrl,
} from '@kunk/config';
import { AdminLoader } from './AdminLoader.jsx';
import { LogoTrimCropModal } from './LogoTrimCropModal.jsx';
import { uploadAppearanceAsset } from '../lib/kunkAppearanceConfig.js';

function AssetSlot({
  label,
  hint,
  format,
  value,
  onPersist,
  api,
  onError,
  busy,
  setBusy,
}) {
  const [cropSrc, setCropSrc] = useState(null);

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError('');
    setCropSrc(URL.createObjectURL(file));
  }

  function onCancelCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function onConfirmCrop(blob) {
    setBusy(true);
    onError('');
    try {
      const name =
        format === LOGO_FORMAT_RECTANGULAR
          ? 'association-logo-rect.png'
          : 'association-logo-square.png';
      const uploaded = await uploadAppearanceAsset(
        api,
        new File([blob], name, { type: 'image/png' }),
      );
      await onPersist(uploaded);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch (err) {
      onError(err.message || 'Falha no upload da logo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logo-slot">
      <div className="logo-slot-header">
        <strong>{label}</strong>
      </div>
      <p className="muted logo-slot-hint">{hint}</p>
      <div
        className={`logo-asset-preview logo-asset-preview--${format}`}
        aria-label={`Pré-visualização ${label}`}
      >
        {value ? <img src={value} alt="" /> : <span className="muted">Sem arquivo</span>}
      </div>
      <div className="appearance-upload-row">
        <label className="btn">
          {busy ? 'Enviando…' : value ? 'Trocar' : 'Enviar'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
        </label>
        {value ? (
          <button type="button" className="btn" onClick={() => onPersist('')} disabled={busy}>
            Remover
          </button>
        ) : null}
      </div>
      {cropSrc ? (
        <LogoTrimCropModal
          src={cropSrc}
          title={format === LOGO_FORMAT_RECTANGULAR ? 'Recortar logo completa' : 'Recortar símbolo'}
          busy={busy}
          onConfirm={onConfirmCrop}
          onCancel={onCancelCrop}
        />
      ) : null}
    </div>
  );
}

function PlacementRow({
  app,
  surface,
  placements,
  logoSquare,
  logoRectangular,
  onChange,
  disabled,
}) {
  const hasSquare = Boolean(resolveBrandingLogoUrl(logoSquare));
  const hasRect = Boolean(resolveBrandingLogoUrl(logoRectangular));
  const hasAny = hasSquare || hasRect;
  const slot = placements[app][surface];
  const controlsDisabled = disabled || !hasAny;

  function setFormat(nextFormat) {
    if (!hasAny) return;
    if (nextFormat === LOGO_FORMAT_SQUARE && !hasSquare) return;
    if (nextFormat === LOGO_FORMAT_RECTANGULAR && !hasRect) return;
    const next = structuredClone(placements);
    next[app][surface].format = nextFormat;
    onChange(next);
  }

  function setWidthRaw(raw) {
    if (!hasAny) return;
    const next = structuredClone(placements);
    // Mantém o que o usuário digitou; clamp só no save do bloco.
    const digits = String(raw ?? '').replace(/[^\d]/g, '');
    next[app][surface].width = digits === '' ? '' : Number(digits);
    onChange(next);
  }

  return (
    <div className={`logo-placement-row${controlsDisabled ? ' logo-placement-row--disabled' : ''}`}>
      <div className="logo-placement-row-label">{BRANDING_SURFACE_LABELS[surface]}</div>
      <label className="field logo-placement-field">
        <span>Tipo</span>
        <select
          value={
            slot.format === LOGO_FORMAT_RECTANGULAR && hasRect
              ? LOGO_FORMAT_RECTANGULAR
              : hasSquare
                ? LOGO_FORMAT_SQUARE
                : hasRect
                  ? LOGO_FORMAT_RECTANGULAR
                  : LOGO_FORMAT_SQUARE
          }
          disabled={controlsDisabled || (hasSquare && hasRect ? false : true)}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value={LOGO_FORMAT_SQUARE} disabled={!hasSquare}>
            Símbolo
          </option>
          <option value={LOGO_FORMAT_RECTANGULAR} disabled={!hasRect}>
            Logo completa
          </option>
        </select>
      </label>
      <label className="field logo-placement-field">
        <span>Largura (px)</span>
        <input
          type="number"
          min={LOGO_WIDTH_MIN}
          max={LOGO_WIDTH_MAX}
          step={1}
          value={slot.width === '' || slot.width == null ? '' : slot.width}
          disabled={controlsDisabled}
          onChange={(e) => setWidthRaw(e.target.value)}
        />
      </label>
    </div>
  );
}

function AppPlacementBlock({
  app,
  savedPlacements,
  logoSquare,
  logoRectangular,
  onSave,
  disabled,
}) {
  const savedApp = savedPlacements[app];
  const savedKey = JSON.stringify(savedApp);
  const [draft, setDraft] = useState(() => structuredClone(savedApp));
  const [dirty, setDirty] = useState(false);

  // Sincroniza só quando os valores persistidos mudam (não a cada render).
  useEffect(() => {
    setDraft(JSON.parse(savedKey));
    setDirty(false);
  }, [savedKey]);

  const hasAnyAsset = Boolean(
    resolveBrandingLogoUrl(logoSquare) || resolveBrandingLogoUrl(logoRectangular),
  );

  const draftPlacements = {
    ...savedPlacements,
    [app]: draft,
  };

  function onDraftChange(nextFull) {
    setDraft(structuredClone(nextFull[app]));
    setDirty(true);
  }

  async function handleSave() {
    const next = structuredClone(savedPlacements);
    next[app] = {
      login: {
        format: draft.login.format,
        width: clampLogoWidth(draft.login.width, savedApp.login.width),
      },
      menu: {
        format: draft.menu.format,
        width: clampLogoWidth(draft.menu.width, savedApp.menu.width),
      },
    };
    await onSave(next);
  }

  return (
    <section className="logo-placement-app">
      <h4 className="logo-placement-app-title">{BRANDING_APP_LABELS[app]}</h4>
      {BRANDING_SURFACES.map((surface) => (
        <PlacementRow
          key={`${app}-${surface}`}
          app={app}
          surface={surface}
          placements={draftPlacements}
          logoSquare={logoSquare}
          logoRectangular={logoRectangular}
          onChange={onDraftChange}
          disabled={disabled || !hasAnyAsset}
        />
      ))}
      <div className="logo-placement-app-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || !hasAnyAsset || !dirty}
          onClick={handleSave}
        >
          Salvar
        </button>
      </div>
    </section>
  );
}

/**
 * Assets (símbolo + completa) + tipo/largura por app (login e menu).
 */
export function AssociationLogosField({
  logoSquare,
  logoRectangular,
  logoPlacements,
  onPersist,
  api,
  onError,
}) {
  const [busy, setBusy] = useState(false);
  const [savingLabel, setSavingLabel] = useState('');
  const placements = normalizeLogoPlacements(logoPlacements);

  async function persistSquare(url) {
    setBusy(true);
    setSavingLabel('Salvando…');
    onError('');
    try {
      await onPersist({
        logoSquare: String(url || ''),
        logoRectangular,
        logoPlacements: placements,
      });
    } finally {
      setBusy(false);
      setSavingLabel('');
    }
  }

  async function persistRectangular(url) {
    setBusy(true);
    setSavingLabel('Salvando…');
    onError('');
    try {
      await onPersist({
        logoSquare,
        logoRectangular: String(url || ''),
        logoPlacements: placements,
      });
    } finally {
      setBusy(false);
      setSavingLabel('');
    }
  }

  async function persistPlacements(nextPlacements) {
    setBusy(true);
    setSavingLabel('Salvando…');
    onError('');
    try {
      await onPersist({
        logoSquare,
        logoRectangular,
        logoPlacements: normalizeLogoPlacements(nextPlacements),
      });
    } catch {
      /* erro já tratado na página */
    } finally {
      setBusy(false);
      setSavingLabel('');
    }
  }

  const hasAnyAsset = Boolean(
    resolveBrandingLogoUrl(logoSquare) || resolveBrandingLogoUrl(logoRectangular),
  );

  return (
    <div className={`association-logos-field${busy ? ' association-logos-field--busy' : ''}`}>
      <p className="muted" style={{ margin: '0 0 0.75rem' }}>
        Cadastre o <strong>símbolo</strong> e a <strong>logo completa</strong>. No envio você pode
        recortar a imagem para aparar espaços em branco. Depois escolha o tipo e a largura em cada
        login e menu e clique em Salvar.
      </p>

      <div className="association-logos-grid" aria-busy={busy}>
        {busy ? (
          <div className="association-logos-loader" role="status" aria-live="polite">
            <AdminLoader
              label={savingLabel || 'Salvando…'}
              className="admin-loader--embedded"
            />
          </div>
        ) : null}
        <AssetSlot
          label="Símbolo"
          hint="Marca compacta — recorte livre para aparar espaços em branco."
          format={LOGO_FORMAT_SQUARE}
          value={logoSquare}
          onPersist={persistSquare}
          api={api}
          onError={onError}
          busy={busy}
          setBusy={setBusy}
        />
        <AssetSlot
          label="Logo completa"
          hint="Logo com texto/nome — recorte livre para aparar espaços em branco."
          format={LOGO_FORMAT_RECTANGULAR}
          value={logoRectangular}
          onPersist={persistRectangular}
          api={api}
          onError={onError}
          busy={busy}
          setBusy={setBusy}
        />
      </div>

      <h3 className="logo-placements-title">Exibição por app</h3>
      {!hasAnyAsset ? (
        <p className="muted" style={{ margin: '0 0 0.75rem' }}>
          Envie ao menos um arquivo (símbolo ou logo completa) para configurar tipo e largura.
        </p>
      ) : null}

      <div className="logo-placements-list">
        {BRANDING_APPS.map((app) => (
          <AppPlacementBlock
            key={app}
            app={app}
            savedPlacements={placements}
            logoSquare={logoSquare}
            logoRectangular={logoRectangular}
            onSave={persistPlacements}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  );
}
