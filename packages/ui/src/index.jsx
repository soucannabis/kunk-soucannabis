import React from 'react';

export function AlertError({ message, emptyFields, className = '' }) {
  const fields = Array.isArray(emptyFields)
    ? emptyFields.filter(Boolean)
    : emptyFields
      ? [emptyFields]
      : [];
  if (!message && !fields.length) return null;
  return (
    <div className={`alert alert-danger${className ? ` ${className}` : ''}`} role="alert">
      {message}
      {fields.length ? (
        <span>
          {message ? ' ' : ''}
          campos que faltam:
          {' '}
          {fields.map((field, index) => (
            <React.Fragment key={`${field}-${index}`}>
              {index > 0 ? ', ' : null}
              <strong>{field}</strong>
            </React.Fragment>
          ))}
          .
        </span>
      ) : null}
    </div>
  );
}

export function Loader({ text = 'carregando...' }) {
  return (
    <div className="container vertical-center text-center">
      <p className="loading-text text-white">{text}</p>
    </div>
  );
}

export function ProgressSidebar({ steps, contactUrl, contactIcon = null }) {
  return (
    <aside className="sidebar p-3">
      <ul className="list-unstyled sidebar-steps mb-0">
        {steps.map((step) => {
          const state = String(step.state || '');
          const isDone = state.split(/\s+/).includes('done');
          const isCurrent = state.split(/\s+/).includes('current');
          const isLocked = state.split(/\s+/).includes('locked');
          return (
            <li
              key={step.id}
              className={[
                'progress-step',
                isDone ? 'done' : '',
                isCurrent ? 'current' : '',
                isLocked ? 'locked' : '',
              ].filter(Boolean).join(' ')}
            >
              {step.icon ? <span className="progress-step-icon">{step.icon}</span> : null}
              <span className="progress-step-label">{step.label}</span>
            </li>
          );
        })}
      </ul>
      {contactUrl ? (
        <a className="btn btn-sm btn-contact mt-auto btn-with-icon" href={contactUrl} target="_blank" rel="noreferrer">
          {contactIcon}
          Solicitar contato
        </a>
      ) : null}
    </aside>
  );
}

export function UploadLabel({ children, htmlFor }) {
  return (
    <label className="label-upload" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function EyeIcon({ crossed }) {
  if (crossed) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a11.5 11.5 0 01-4.2 5.1M6.1 6.1A11.4 11.4 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Password field with show/hide toggle (eye icon). */
export function PasswordInput({
  value,
  onChange,
  className = 'form-control',
  wrapperClassName = 'mb-3',
  ...rest
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className={`position-relative ${wrapperClassName}`.trim()}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={className}
        value={value}
        onChange={onChange}
        style={{
          ...(rest.style || {}),
          paddingRight: '2.75rem',
          // Edge/Chrome: esconde o reveal nativo (evita 2º olho)
          WebkitAppearance: 'none',
        }}
      />
      <button
        type="button"
        className="btn btn-link position-absolute top-50 end-0 translate-middle-y px-2 py-0 text-secondary"
        style={{ zIndex: 2, lineHeight: 1 }}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        tabIndex={-1}
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  );
}

export {
  AuthLoginLayout,
  AuthLoginCard,
  AuthLoginField,
} from './AuthLoginLayout.jsx';
