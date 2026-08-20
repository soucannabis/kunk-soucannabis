import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Variable, Signature } from './extensions.js';
import { variableLabel } from '../labels.js';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export function TermEditor({ contentJson, variables = [], onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Escreva o texto do termo…' }),
      Variable,
      Signature,
    ],
    content: contentJson || EMPTY_DOC,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getJSON());
    },
  });

  useEffect(() => {
    if (!editor || !contentJson) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(contentJson);
    if (current !== next) {
      editor.commands.setContent(contentJson, false);
    }
  }, [contentJson, editor]);

  if (!editor) return null;

  function setParagraphStyle(value) {
    const chain = editor.chain().focus();
    if (value === 'paragraph') chain.setParagraph().run();
    else if (value === 'h1') chain.toggleHeading({ level: 1 }).run();
    else if (value === 'h2') chain.toggleHeading({ level: 2 }).run();
    else if (value === 'h3') chain.toggleHeading({ level: 3 }).run();
  }

  let styleValue = 'paragraph';
  if (editor.isActive('heading', { level: 1 })) styleValue = 'h1';
  else if (editor.isActive('heading', { level: 2 })) styleValue = 'h2';
  else if (editor.isActive('heading', { level: 3 })) styleValue = 'h3';

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        <select
          className="style-select"
          aria-label="Estilo de parágrafo"
          value={styleValue}
          onChange={(e) => setParagraphStyle(e.target.value)}
        >
          <option value="paragraph">Parágrafo</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleBold().run()}>
          Negrito
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleItalic().run()}>
          Itálico
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          Sublinhado
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Lista
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Numerada
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          Esq.
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          Centro
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          Dir.
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          Linha
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().undo().run()}>
          Desfazer
        </button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().redo().run()}>
          Refazer
        </button>
        <select
          aria-label="Inserir variável"
          defaultValue=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            editor.chain().focus().insertVariable(name).run();
            e.target.value = '';
          }}
        >
          <option value="">Inserir variável…</option>
          {variables
            .filter((v) => v.name !== 'signature')
            .map((v) => (
              <option key={v.name} value={v.name}>
                {variableLabel(v.name)}
              </option>
            ))}
        </select>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
