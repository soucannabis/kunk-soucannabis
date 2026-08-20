import React, { useEffect, useState } from 'react';
import {
  getKunkPublicConfig,
  getPublicConfig,
  mergeKunkPublicConfigFromApi,
  mergePublicConfigFromApi,
  applyAssociationLogoToKunkConfig,
  resolvePlacementLogo,
  resolveBrandingLogoUrl,
  LOGO_FORMAT_SQUARE,
} from '@kunk/config';

/** Título fixo do produto — não substituir pelo nome da associação. */
export const DOCSIGN_PRODUCT_TITLE = 'Assinatura de Termos';

function applyFaviconFromLogo(href) {
  const url = String(href || '').trim();
  let link = document.querySelector("link[rel='icon']");
  if (!url) {
    if (link) link.setAttribute('href', '/favicon.svg');
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    document.head.appendChild(link);
  }
  const lower = url.split('?')[0].toLowerCase();
  const type = lower.endsWith('.svg')
    ? 'image/svg+xml'
    : lower.endsWith('.ico')
      ? 'image/x-icon'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';
  link.setAttribute('type', type);
  link.setAttribute('href', url);
}

/**
 * Resolve logos de login/menu do doc-sign a partir dos placements.
 */
function resolveDocSignBranding(mergedKunk, mergedReg) {
  const withLogo = applyAssociationLogoToKunkConfig(mergedKunk || {}, mergedReg || {});
  const square = resolveBrandingLogoUrl(
    withLogo.logoSquare,
    mergedReg?.associationLogoSquare,
  );
  const rectangular = resolveBrandingLogoUrl(
    withLogo.logoRectangular,
    mergedReg?.associationLogoRectangular,
  );
  const login = resolvePlacementLogo({
    placements: withLogo.logoPlacements || mergedReg?.associationLogoPlacements,
    app: 'docsign',
    surface: 'login',
    square,
    rectangular,
    legacy: withLogo.logo,
  });
  const menu = resolvePlacementLogo({
    placements: withLogo.logoPlacements || mergedReg?.associationLogoPlacements,
    app: 'docsign',
    surface: 'menu',
    square,
    rectangular,
    legacy: withLogo.logo,
  });
  const favicon = resolveBrandingLogoUrl(square, login.url, menu.url);
  return {
    login,
    menu,
    favicon: favicon || '',
  };
}

/**
 * Carrega branding do doc-sign (placements login/menu).
 */
export function useDocSignBranding(api) {
  const [login, setLogin] = useState(() =>
    resolveDocSignBranding(getKunkPublicConfig(), getPublicConfig()).login,
  );
  const [menu, setMenu] = useState(() =>
    resolveDocSignBranding(getKunkPublicConfig(), getPublicConfig()).menu,
  );
  const [favicon, setFavicon] = useState(() =>
    resolveDocSignBranding(getKunkPublicConfig(), getPublicConfig()).favicon,
  );
  const [associationName, setAssociationName] = useState(() =>
    String(getPublicConfig().associationName || '').trim(),
  );
  const [brandingReady, setBrandingReady] = useState(false);

  useEffect(() => {
    applyFaviconFromLogo(favicon);
  }, [favicon]);

  useEffect(() => {
    const name = String(associationName || '').trim();
    document.title = name ? `Assinatura - ${name}` : 'Assinatura';
  }, [associationName]);

  useEffect(() => {
    if (!api) {
      setBrandingReady(true);
      return undefined;
    }
    let cancelled = false;
    setBrandingReady(false);
    (async () => {
      let next = resolveDocSignBranding(getKunkPublicConfig(), getPublicConfig());
      let nextName = String(getPublicConfig().associationName || '').trim();
      try {
        const [kunkJson, regJson] = await Promise.all([
          api.get('/config/public?system=kunk'),
          api.get('/config/public?system=registration').catch(() => null),
        ]);
        if (cancelled) return;
        const mergedKunk = mergeKunkPublicConfigFromApi(
          getKunkPublicConfig(),
          kunkJson?.data?.values,
        );
        const mergedReg = mergePublicConfigFromApi(
          getPublicConfig(),
          regJson?.data?.values,
        );
        next = resolveDocSignBranding(mergedKunk, mergedReg);
        nextName = String(mergedReg.associationName || '').trim();
      } catch {
        /* mantém bootstrap */
      }
      if (cancelled) return;
      setLogin(next.login);
      setMenu(next.menu);
      setFavicon(next.favicon);
      setAssociationName(nextName);
      setBrandingReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return {
    logo: login.url,
    logoFormat: login.format,
    logoWidth: login.width,
    logoHeight: login.height,
    menuLogo: menu.url,
    menuLogoFormat: menu.format,
    menuLogoWidth: menu.width,
    menuLogoHeight: menu.height,
    title: DOCSIGN_PRODUCT_TITLE,
    associationName,
    brandingReady,
  };
}

/** Atualiza o favicon com a logo da associação em todas as rotas. */
export function DocSignFavicon({ api }) {
  useDocSignBranding(api);
  return null;
}

/**
 * @param {{
 *   logo?: string,
 *   logoFormat?: string,
 *   logoWidth?: number,
 *   logoHeight?: number,
 *   variant?: 'login' | 'shell',
 *   className?: string,
 * }} props
 */
export function DocSignBrand({
  logo = '',
  logoFormat = LOGO_FORMAT_SQUARE,
  logoWidth,
  variant = 'shell',
  className = '',
}) {
  const format = logoFormat || LOGO_FORMAT_SQUARE;
  const width = Number(logoWidth) || (variant === 'login' ? 162 : 66);
  const rootClass =
    variant === 'login'
      ? `docsign-brand docsign-brand--login docsign-brand--${format} ${className}`.trim()
      : `docsign-brand docsign-brand--shell docsign-brand--${format} brand ${className}`.trim();

  return (
    <div className={rootClass}>
      {logo ? (
        <div className="docsign-brand-logo-wrap">
          <img
            className="docsign-brand-logo brand-logo"
            src={logo}
            alt={DOCSIGN_PRODUCT_TITLE}
            style={{ width, height: 'auto' }}
          />
        </div>
      ) : null}
      {variant === 'login' ? (
        <h1 className="brand login-page-title docsign-brand-title">{DOCSIGN_PRODUCT_TITLE}</h1>
      ) : (
        <span className="brand-text docsign-brand-title">{DOCSIGN_PRODUCT_TITLE}</span>
      )}
    </div>
  );
}
