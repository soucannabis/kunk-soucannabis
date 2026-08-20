import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { STORAGE_SETUP_GUIDES } from '../lib/storageGuides.js';

const CREDENTIAL_GUIDE_BOX_STYLE = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: '0.85rem',
  padding: '0.85rem 1rem',
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#f7f7f7',
  color: '#111',
  lineHeight: 1.45,
};

function childrenToText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join('');
  if (React.isValidElement(node)) return childrenToText(node.props.children);
  return '';
}

function CopyIcon({ copied }) {
  if (copied) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V7a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeBlockWithCopy({ children }) {
  const [copied, setCopied] = useState(false);
  const text = childrenToText(children).replace(/\n$/, '');

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ position: 'relative', margin: '0.55rem 0 0.65rem' }}>
      <button
        type="button"
        onClick={() => void onCopy()}
        title={copied ? 'Copiado' : 'Copiar JSON'}
        aria-label={copied ? 'Copiado' : 'Copiar JSON'}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: '1px solid #444',
          borderRadius: 6,
          background: copied ? '#2e7d32' : '#2a2a2a',
          color: '#f3f3f3',
          cursor: 'pointer',
        }}
      >
        <CopyIcon copied={copied} />
      </button>
      <pre
        style={{
          margin: 0,
          padding: '0.65rem 2.5rem 0.65rem 0.75rem',
          overflowX: 'auto',
          maxHeight: 280,
          borderRadius: 6,
          border: '1px solid #d0d0d0',
          background: '#1e1e1e',
          color: '#f3f3f3',
          fontSize: '0.72rem',
          lineHeight: 1.4,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {children}
      </pre>
    </div>
  );
}

const mdComponents = {
  p: ({ children }) => <p style={{ margin: '0.45rem 0' }}>{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: '#0b57d0' }}>
      {children}
    </a>
  ),
  strong: ({ children }) => <strong style={{ fontWeight: 650 }}>{children}</strong>,
  ul: ({ children }) => (
    <ul style={{ margin: '0.35rem 0 0.5rem', paddingLeft: '1.2rem' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '0.35rem 0 0.5rem', paddingLeft: '1.2rem' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  code: ({ className, children }) => {
    const isBlock = typeof className === 'string' && className.includes('language-');
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.8em',
          background: '#ececec',
          borderRadius: 4,
          padding: '0.08rem 0.28rem',
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <CodeBlockWithCopy>{children}</CodeBlockWithCopy>,
};

export function StorageCredentialsGuide({ provider, bucket, keyPrefix }) {
  const guide = STORAGE_SETUP_GUIDES[provider];
  if (!guide) return null;
  const { title, docs } = guide;
  const steps = typeof guide.steps === 'function'
    ? guide.steps({ bucket, keyPrefix })
    : guide.steps;

  return (
    <div
      className="ext-credentials-guide"
      data-testid={`storage-${provider}-setup-guide`}
      style={CREDENTIAL_GUIDE_BOX_STYLE}
    >
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#111' }}>
        {title || 'Como obter as credenciais'}
      </p>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#111' }}>
        {steps.map((step, i) => (
          <li key={i} style={{ marginBottom: i === steps.length - 1 ? 0 : 10 }}>
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

export { STORAGE_SETUP_GUIDES };
