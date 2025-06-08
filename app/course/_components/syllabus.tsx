'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';
import { EditorToolbar } from './syllabus-editor';

export const SimpleEditor = () => {
  const [isPreview, setIsPreview] = useState(true);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Course Description.....</p>',
    editorProps: {
      attributes: {
        class: 'prose max-w-none p-4 focus:outline-none min-h-[400px]',
      },
    },
  });

  if (!editor) return null;

  return (
    <div className={`border rounded-lg overflow-hidden ${!isPreview ? 'flex flex-col max-h-[500px]' : ''}`}>
      <EditorToolbar editor={editor} isPreview={isPreview} onTogglePreview={() => setIsPreview(!isPreview)} />

      {isPreview ? (
        <div className="p-4 bg-white">
          <div className="preview-content" dangerouslySetInnerHTML={{ __html: editor.getHTML() }} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
};

export default SimpleEditor;
