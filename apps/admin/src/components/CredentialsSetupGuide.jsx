import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CREDENTIAL_SETUP_GUIDES } from '../lib/credentialGuides.js';

const CREDENTIAL_GUIDE_BOX_STYLE = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: '0.85rem',
  padding: '0.85rem 1rem',
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#f7f7f7',
  color: '#111',
};

const mdComponents = {
  p: ({ children }) => <>{children}</>,
  a: ({ href, children }) => {
    let testId;
    if (href === 'https://www.geoapify.com') testId = 'geoapify-site-link';
    else if (href === 'https://myprojects.geoapify.com') testId = 'geoapify-projects-link';
    else if (href === 'https://console.cloud.google.com/') testId = 'gc-console-link';
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: '#0b57d0' }}
        data-testid={testId}
      >
        {children}
      </a>
    );
  },
};

/**
 * Guia “Como obter as credenciais” — conteúdo em lib/credentialGuides.js.
 */
export function CredentialsSetupGuide({ service }) {
  const guide = CREDENTIAL_SETUP_GUIDES[service];
  if (!guide) return null;
  const { title, steps, docs } = guide;
  const testId =
    service === 'google_calendar' ? 'google-calendar-setup-guide' : `${service}-setup-guide`;

  return (
    <div className="ext-credentials-guide" data-testid={testId} style={CREDENTIAL_GUIDE_BOX_STYLE}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#111' }}>
        {title || 'Como obter as credenciais'}
      </p>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#111' }}>
        {steps.map((step, i) => (
          <li key={i} style={{ marginBottom: i === steps.length - 1 ? 0 : 6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {step}
            </ReactMarkdown>
          </li>
        ))}
      </ol>
      {docs?.length ? (
        <p style={{ margin: '0.75rem 0 0', color: '#444' }}>
          Docs:{' '}
          {docs.map((d, i) => (
            <span key={d.href}>
              {i > 0 ? ' · ' : null}
              <a href={d.href} target="_blank" rel="noreferrer" style={{ color: '#0b57d0' }}>
                {d.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export { CREDENTIAL_SETUP_GUIDES };
