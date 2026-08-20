import React from 'react';
import { statusTitle } from '../lib/externalServiceStatus.js';

/** Ponto de status para o menu lateral. */
export function ExternalServiceStatusIcon({ kind, label }) {
  return (
    <span
      className={`ext-status-dot ext-status-dot--${kind || 'warning'}`}
      title={label || statusTitle(kind)}
      aria-label={label || statusTitle(kind)}
      role="img"
    />
  );
}

/** Banner padrão no topo de cada módulo. */
export function ExternalServiceStatusBanner({ status }) {
  if (!status) return null;
  const kind = status.kind || 'warning';
  return (
    <div
      className={`alert ext-status-banner ext-status-banner--${kind}`}
      role="status"
      data-testid="ext-status-banner"
    >
      <span className={`ext-status-dot ext-status-dot--${kind}`} aria-hidden="true" />
      <div className="ext-status-banner-body">
        <strong className="ext-status-banner-title">
          {status.label || statusTitle(kind)}
        </strong>
        {status.detail ? <p className="ext-status-banner-detail">{status.detail}</p> : null}
      </div>
    </div>
  );
}

/** Feedback de erro/sucesso abaixo de botões de ação. */
export function ExtActionFeedback({ at, feedbackAt, error, msg }) {
  if (feedbackAt !== at) return null;
  return (
    <div className="ext-action-feedback" data-testid={`ext-feedback-${at}`}>
      {error ? (
        <p className="alert alert-error" role="alert" data-testid="ext-error">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="alert alert-info" data-testid="ext-msg">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
