import React from 'react';

/**
 * Loader padrão do Admin — sempre centralizado na área de conteúdo.
 * @param {{ label?: string, className?: string, 'data-testid'?: string }} props
 */
export function AdminLoader({ label = 'Carregando…', className = '', ...rest }) {
  return (
    <div
      className={`admin-loader${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...rest}
    >
      <div className="admin-loader-mark" aria-hidden="true">
        <span className="admin-loader-ring admin-loader-ring--outer" />
        <span className="admin-loader-ring admin-loader-ring--inner" />
        <span className="admin-loader-dot" />
      </div>
      {label ? <p className="admin-loader-label">{label}</p> : null}
    </div>
  );
}
