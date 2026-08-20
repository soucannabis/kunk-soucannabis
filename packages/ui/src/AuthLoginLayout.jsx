import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getBrandLogoFrameStyle, LOGO_FORMAT_SQUARE } from '@kunk/config';
import './auth-login.css';

function preloadImage(src) {
  return new Promise((resolve) => {
    const url = String(src || '').trim();
    if (!url) {
      resolve();
      return;
    }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = url;
    if (img.complete) done();
  });
}

function resolveBgSrc(backgroundImage) {
  const raw = String(backgroundImage || '').trim();
  if (!raw) return '';
  const match = raw.match(/^url\((['"]?)(.+)\1\)$/i);
  return match ? match[2] : raw;
}

/**
 * Full-viewport public auth shell (logo + title + form slot).
 * Same layout for Cadastro, Kunk and Assinatura de Termos.
 *
 * Keeps the panel mounted (hidden) while branding assets paint, then reveals
 * logo + form together — avoids flash of form without logo.
 *
 * @param {{
 *   backgroundImage?: string,
 *   logo?: string,
 *   logoFormat?: string,
 *   logoWidth?: number,
 *   title?: string,
 *   accent?: string,
 *   ready?: boolean,
 *   lockBodyScroll?: boolean,
 *   className?: string,
 *   children?: React.ReactNode,
 * }} props
 */
export function AuthLoginLayout({
  backgroundImage = '',
  logo = '',
  logoFormat = LOGO_FORMAT_SQUARE,
  logoWidth,
  title = '',
  accent = '',
  ready = true,
  lockBodyScroll = true,
  className = '',
  children,
}) {
  const frame = getBrandLogoFrameStyle(logoFormat, 'login', logoWidth);
  const width = frame.width;
  const bg = String(backgroundImage || '').trim();
  const logoUrl = String(logo || '').trim();
  const heading = String(title || '').trim();
  const logoRef = useRef(null);
  const [bgReady, setBgReady] = useState(false);
  /** URL whose <img> has already fired load/error — must match logoUrl to reveal. */
  const [paintedLogoUrl, setPaintedLogoUrl] = useState('');

  useEffect(() => {
    if (!lockBodyScroll) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevBgImage = document.body.style.backgroundImage;
    document.body.style.overflow = 'hidden';
    document.body.style.backgroundImage = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.backgroundImage = prevBgImage;
    };
  }, [lockBodyScroll]);

  useEffect(() => {
    if (!ready) {
      setBgReady(false);
      return undefined;
    }
    let cancelled = false;
    setBgReady(false);
    preloadImage(resolveBgSrc(bg)).then(() => {
      if (!cancelled) setBgReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, bg]);

  useLayoutEffect(() => {
    if (!logoUrl) return;
    const node = logoRef.current;
    if (node?.complete) setPaintedLogoUrl(logoUrl);
  }, [logoUrl]);

  const logoReady = !logoUrl || paintedLogoUrl === logoUrl;
  const showContent = Boolean(ready && bgReady && logoReady);

  const style = {
    ...(bg ? { '--auth-login-bg-image': bg.startsWith('url(') ? bg : `url(${bg})` } : null),
    ...(accent ? { '--auth-login-accent': accent } : null),
  };

  return (
    <div
      className={`auth-login-page${showContent ? ' auth-login-page--ready' : ' auth-login-page--loading'}${className ? ` ${className}` : ''}`}
      style={style}
      aria-busy={!showContent}
    >
      {!showContent ? (
        <div className="auth-login-loader" role="status" aria-live="polite">
          <span className="auth-login-spinner" aria-hidden />
          <span className="auth-login-loader-text">Carregando…</span>
        </div>
      ) : null}

      {ready ? (
        <div
          className={`auth-login-stack${showContent ? '' : ' auth-login-stack--pending'}`}
          aria-hidden={!showContent}
        >
          {logoUrl ? (
            <div className={`auth-login-logo auth-login-logo--${frame.format}`}>
              <img
                key={logoUrl}
                ref={logoRef}
                src={logoUrl}
                alt={heading || 'Logo'}
                style={{ width, height: 'auto' }}
                onLoad={() => setPaintedLogoUrl(logoUrl)}
                onError={() => setPaintedLogoUrl(logoUrl)}
              />
            </div>
          ) : null}
          <div className="auth-login-panel">
            {heading ? <h1 className="auth-login-title">{heading}</h1> : null}
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Semi-transparent form card used inside AuthLoginLayout.
 * @param {{
 *   as?: 'form' | 'div',
 *   heading?: string,
 *   className?: string,
 *   children?: React.ReactNode,
 * } & React.FormHTMLAttributes<HTMLFormElement>} props
 */
export function AuthLoginCard({
  as = 'form',
  heading = '',
  className = '',
  children,
  ...rest
}) {
  const Tag = as === 'div' ? 'div' : 'form';
  const titleText = String(heading || '').trim();
  return (
    <Tag className={`auth-login-card${className ? ` ${className}` : ''}`} {...rest}>
      {titleText ? <h2 className="auth-login-card-heading">{titleText}</h2> : null}
      {children}
    </Tag>
  );
}

/**
 * Label + control field block.
 * @param {{
 *   label: string,
 *   htmlFor?: string,
 *   className?: string,
 *   children?: React.ReactNode,
 * }} props
 */
export function AuthLoginField({ label, htmlFor, className = '', children }) {
  return (
    <div className={`auth-login-field${className ? ` ${className}` : ''}`}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
    </div>
  );
}
