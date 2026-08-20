import { Node, mergeAttributes } from '@tiptap/core';
import { VARIABLE_LABEL } from '../labels.js';

export const Variable = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      name: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-variable]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const name = node.attrs.name;
    const label = VARIABLE_LABEL[name] || name || '?';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable': name,
        class: 'var-chip',
      }),
      `{{${label}}}`,
    ];
  },
  addCommands() {
    return {
      insertVariable:
        (name) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
    };
  },
});

export const Signature = Node.create({
  name: 'signature',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      name: { default: 'signature' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-signature]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-signature': 'signature',
        class: 'sig-chip',
      }),
      '[ASSINATURA]',
    ];
  },
  addCommands() {
    return {
      insertSignature:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name: 'signature' } }),
    };
  },
});
