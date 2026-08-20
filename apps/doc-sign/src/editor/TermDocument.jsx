import React from 'react';

function renderMarks(text, marks) {
  let node = text;
  if (!Array.isArray(marks)) return node;
  for (const mark of marks) {
    if (mark.type === 'bold') node = <strong key="b">{node}</strong>;
    else if (mark.type === 'italic') node = <em key="i">{node}</em>;
    else if (mark.type === 'strike') node = <s key="s">{node}</s>;
    else if (mark.type === 'code') node = <code key="c">{node}</code>;
    else if (mark.type === 'link' && mark.attrs?.href) {
      node = (
        <a key="a" href={mark.attrs.href} target="_blank" rel="noreferrer">
          {node}
        </a>
      );
    }
  }
  return node;
}

function renderInline(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  return nodes.map((node, i) => {
    if (!node) return null;
    if (node.type === 'text') {
      return <React.Fragment key={i}>{renderMarks(node.text || '', node.marks)}</React.Fragment>;
    }
    if (node.type === 'hardBreak') return <br key={i} />;
    if (node.type === 'variable') {
      return (
        <span key={i} className="var-chip">
          {node.attrs?.name ? `{{${node.attrs.name}}}` : ''}
        </span>
      );
    }
    if (node.type === 'signature') {
      return (
        <span key={i} className="sig-chip">
          [ASSINATURA]
        </span>
      );
    }
    if (Array.isArray(node.content)) {
      return <React.Fragment key={i}>{renderInline(node.content)}</React.Fragment>;
    }
    return null;
  });
}

function renderBlock(node, index) {
  if (!node) return null;
  const children = renderInline(node.content);

  switch (node.type) {
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3);
      const Tag = `h${level}`;
      return <Tag key={index}>{children}</Tag>;
    }
    case 'paragraph':
      return <p key={index}>{children || <br />}</p>;
    case 'bulletList':
      return (
        <ul key={index}>
          {(node.content || []).map((item, i) => renderBlock(item, i))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={index}>
          {(node.content || []).map((item, i) => renderBlock(item, i))}
        </ol>
      );
    case 'listItem':
      return (
        <li key={index}>
          {(node.content || []).map((child, i) => renderBlock(child, i))}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote key={index}>
          {(node.content || []).map((child, i) => renderBlock(child, i))}
        </blockquote>
      );
    case 'horizontalRule':
      return <hr key={index} />;
    default:
      if (Array.isArray(node.content)) {
        return (
          <div key={index}>
            {node.content.map((child, i) => renderBlock(child, i))}
          </div>
        );
      }
      return null;
  }
}

/**
 * Visualização somente leitura do termo a partir do TipTap JSON já preenchido.
 * Sem TipTap editor — evita bloco vazio com React 19.
 * A assinatura no PDF é inserida automaticamente pela API (não faz parte do modelo).
 */
export function TermDocument({ contentJson }) {
  const blocks = contentJson?.content;

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return <p className="muted">Conteúdo do termo indisponível.</p>;
  }

  return (
    <div className="term-document">
      {blocks.map((node, i) => renderBlock(node, i))}
      <p className="term-signature-line">
        <strong>Assinatura:</strong> <span className="muted">será coletada abaixo</span>
      </p>
    </div>
  );
}
