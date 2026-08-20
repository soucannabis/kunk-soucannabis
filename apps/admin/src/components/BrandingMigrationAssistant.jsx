import React, { useState } from 'react';

/**
 * Assistente pós-ativação do bucket: migra logo/fundo locais para a nuvem.
 */
export function BrandingMigrationAssistant({
  open,
  brandingMigration,
  driverLabel,
  busy,
  error,
  message,
  onMigrate,
  onDismiss,
  onClose,
}) {
  if (!open) return null;

  const pending = (brandingMigration?.assets || []).filter((a) => a.pending);
  const logos = pending.filter((a) => a.kind === 'logo');
  const backgrounds = pending.filter((a) => a.kind === 'background');
  const preview = logos[0] || backgrounds[0] || null;
  const done = Boolean(message) && !pending.length;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="modal-card branding-migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branding-migration-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="branding-migration-title" style={{ marginTop: 0 }}>
          {done ? 'Logo no bucket' : 'Enviar logo para o bucket'}
        </h2>

        {done ? (
          <>
            <p>
              A logo institucional agora está no armazenamento
              {' '}
              <strong>{driverLabel}</strong>
              . Os apps continuam usando
              {' '}
              <span className="mono">/api/v1/files/…/download</span>
              {' '}
              — o arquivo é lido do bucket.
            </p>
            {message ? <div className="alert alert-success">{message}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Concluir
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              O bucket
              {' '}
              <strong>{driverLabel}</strong>
              {' '}
              está ativo. A logo (e a imagem de fundo, se houver) ainda estão no disco local.
              Envie-as para o bucket para não perdê-las se o servidor for recriado.
            </p>

            {preview?.url ? (
              <div className="branding-migration-preview" aria-label="Pré-visualização">
                <img src={preview.url} alt={preview.label || 'Logo'} />
              </div>
            ) : null}

            <ul className="branding-migration-list">
              {pending.map((asset) => (
                <li key={asset.file_id}>
                  <strong>{asset.labels?.join(' · ') || asset.label}</strong>
                  <span className="muted">
                    {' '}
                    — local →
                    {' '}
                    {driverLabel}
                  </span>
                </li>
              ))}
            </ul>

            {error ? <div className="alert alert-error">{error}</div> : null}
            {message ? <div className="alert alert-info">{message}</div> : null}

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                marginTop: '1rem',
              }}
            >
              <button type="button" className="btn" disabled={busy} onClick={onDismiss}>
                Agora não
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !pending.length}
                onClick={onMigrate}
              >
                {busy ? (
                  <>
                    <span className="spinner spinner-inline" aria-hidden="true" />
                    Enviando…
                  </>
                ) : logos.length && backgrounds.length ? (
                  'Enviar logo e fundo'
                ) : backgrounds.length && !logos.length ? (
                  'Enviar imagem de fundo'
                ) : (
                  'Enviar logo para o bucket'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Card compacto quando o bucket já está ativo e ainda há logo local.
 */
export function BrandingMigrationBanner({
  brandingMigration,
  driverLabel,
  busy,
  onOpen,
}) {
  const pending = brandingMigration?.pending_count || 0;
  if (!pending) return null;

  return (
    <div className="alert alert-info" style={{ marginBottom: '1rem' }} data-testid="branding-migration-banner">
      <p style={{ margin: '0 0 0.75rem' }}>
        Há
        {' '}
        <strong>
          {pending === 1 ? '1 asset de marca' : `${pending} assets de marca`}
        </strong>
        {' '}
        ainda no disco local (logo e/ou fundo). Envie para o bucket
        {' '}
        <strong>{driverLabel}</strong>
        {' '}
        para proteger a identidade visual.
      </p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onOpen}>
        Abrir assistente
      </button>
    </div>
  );
}

export function useBrandingMigrationAssistant() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateError, setMigrateError] = useState('');
  const [migrateMessage, setMigrateMessage] = useState('');

  function openAssistant() {
    setMigrateError('');
    setMigrateMessage('');
    setDismissed(false);
    setAssistantOpen(true);
  }

  function closeAssistant() {
    setAssistantOpen(false);
  }

  function dismissAssistant() {
    setDismissed(true);
    setAssistantOpen(false);
  }

  /**
   * After bucket activation: open assistant if branding is still local.
   * @param {{ branding_migration?: { needs_assistant?: boolean } }|null|undefined} status
   */
  function maybeOpenAfterActivate(status) {
    if (status?.branding_migration?.needs_assistant) {
      setMigrateError('');
      setMigrateMessage('');
      setDismissed(false);
      setAssistantOpen(true);
    }
  }

  return {
    assistantOpen,
    dismissed,
    migrateBusy,
    migrateError,
    migrateMessage,
    setMigrateBusy,
    setMigrateError,
    setMigrateMessage,
    openAssistant,
    closeAssistant,
    dismissAssistant,
    maybeOpenAfterActivate,
  };
}
