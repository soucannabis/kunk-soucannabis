import React, { useEffect, useMemo, useState } from 'react';
import { createApiClient } from '@kunk/api-client';
import { getPublicConfig } from '@kunk/config';
import { Loader } from '@kunk/ui';
import { usePublicConfig } from '../config/PublicConfigProvider.jsx';

function kunkTriageBaseUrl() {
  return String(
    import.meta.env.VITE_KUNK_PUBLIC_URL
      || import.meta.env.VITE_KUNK_URL
      || 'http://localhost:4257',
  ).replace(/\/$/, '');
}

export function ContactPage() {
  const { config: cfg } = usePublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: getPublicConfig().apiUrl }), []);
  const [iframeHeight, setIframeHeight] = useState(720);
  const [iframeTheme, setIframeTheme] = useState('dark');
  const [embedUrl, setEmbedUrl] = useState('');
  const [schemaReady, setSchemaReady] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  const logo = String(cfg.appearanceLogo || '').trim();
  const format = cfg.appearanceLogoFormat || 'square';
  const configuredW = Number(cfg.appearanceLogoWidth) || 162;
  const frameW = Math.round(configuredW * 0.72);
  const fullName = String(cfg.associationFullName || cfg.associationName || '').trim();

  useEffect(() => {
    let cancelled = false;
    setSchemaReady(false);
    setIframeReady(false);
    (async () => {
      try {
        const res = await api.receptionFormSchema();
        if (cancelled) return;
        const theme = res.data?.theme === 'light' ? 'light' : 'dark';
        setIframeTheme(theme);
        setIframeReady(false);
        setEmbedUrl(`${kunkTriageBaseUrl()}/contato?embed=1&theme=${theme}`);
      } catch {
        if (!cancelled) {
          setIframeReady(false);
          setEmbedUrl(`${kunkTriageBaseUrl()}/contato?embed=1`);
        }
      } finally {
        if (!cancelled) setSchemaReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    function onMessage(event) {
      const data = event?.data;
      if (!data || data.source !== 'kunk-triage-embed') return;
      if (data.type === 'resize') {
        const next = Number(data.height);
        if (Number.isFinite(next) && next >= 120) {
          setIframeHeight(Math.ceil(next));
          setIframeReady(true);
        }
        if (data.theme === 'light' || data.theme === 'dark') {
          setIframeTheme(data.theme);
        }
        return;
      }
      if (data.type === 'scroll-top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const showForm = schemaReady && Boolean(embedUrl) && iframeReady;

  return (
    <div className={`contact-page${iframeTheme === 'light' ? ' contact-page--light' : ''}`}>
      <div className="contact-page-inner">
        <header className="contact-page-brand">
          {logo ? (
            <div className={`contact-page-logo auth-public-logo auth-public-logo--${format}`}>
              <img
                src={logo}
                alt={fullName || 'Logo da associação'}
                style={{
                  width: frameW,
                  height: 'auto',
                }}
              />
            </div>
          ) : null}
          {fullName ? <h1 className="contact-page-title auth-association-name">{fullName}</h1> : null}
        </header>

        {!showForm ? (
          <div className="contact-loader" aria-live="polite" aria-busy="true">
            <Loader text="Carregando formulário…" />
          </div>
        ) : null}

        {schemaReady && embedUrl ? (
          <div
            className="contact-iframe-wrap"
            hidden={!showForm}
            aria-hidden={!showForm}
          >
            <iframe
              key={embedUrl}
              title="Formulário de contato"
              src={embedUrl}
              className="contact-iframe"
              style={{ height: `${iframeHeight}px` }}
              scrolling="no"
              referrerPolicy="no-referrer-when-downgrade"
              allow="clipboard-write"
              onLoad={() => setIframeReady(true)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
