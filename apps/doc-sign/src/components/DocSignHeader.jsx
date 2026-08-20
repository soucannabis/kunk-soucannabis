import React from 'react';
import { DocSignBrand } from './DocSignBrand.jsx';

/**
 * Barra superior de largura total (gestão e página pública de assinatura).
 */
export function DocSignHeader({
  logo = '',
  logoFormat,
  logoWidth,
  children,
}) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <DocSignBrand
          logo={logo}
          logoFormat={logoFormat}
          logoWidth={logoWidth}
          variant="shell"
        />
        {children ? <div className="app-header-actions">{children}</div> : null}
      </div>
    </header>
  );
}
