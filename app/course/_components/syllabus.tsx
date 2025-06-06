// 'use client';

// import { useEditor, EditorContent } from '@tiptap/react';
// import StarterKit from '@tiptap/starter-kit';
// import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Undo, Redo, Eye, Edit3 } from 'lucide-react';
// import { useState } from 'react';

// interface ToolbarButtonProps {
//   onClick: () => void;
//   isActive?: boolean;
//   children: React.ReactNode;
//   title?: string;
// }

// const ToolbarButton = ({ onClick, isActive, children, title }: ToolbarButtonProps) => (
//   <button
//     onClick={onClick}
//     className={`p-2 rounded hover:bg-gray-100 transition-colors ${
//       isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-600'
//     }`}
//     title={title}
//     type="button"
//   >
//     {children}
//   </button>
// );

// export const SimpleEditor = () => {
//   const [isPreview, setIsPreview] = useState(false);

//   const editor = useEditor({
//     extensions: [StarterKit],
//     content: '<p>Course Description.....</p>',
//     editorProps: {
//       attributes: {
//         class: 'prose max-w-none p-4 focus:outline-none min-h-[400px]',
//       },
//     },
//   });

//   if (!editor) {
//     return null;
//   }

//   const togglePreview = () => {
//     setIsPreview(!isPreview);
//   };

//   return (
//     <div className={`border rounded-lg overflow-hidden ${!isPreview ? 'flex flex-col max-h-[600px]' : ''}`}>
//       {/* Fixed Toolbar */}
//       <div className="flex items-center justify-between gap-1 p-2 border-b bg-gray-50 flex-shrink-0">
//         <div className="flex items-center gap-1">
//           {!isPreview && (
//             <>
//               <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
//                 <Undo size={16} />
//               </ToolbarButton>

//               <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
//                 <Redo size={16} />
//               </ToolbarButton>

//               <div className="w-px h-6 bg-gray-300 mx-2" />

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
//                 isActive={editor.isActive('heading', { level: 1 })}
//                 title="Heading 1"
//               >
//                 <Heading1 size={16} />
//               </ToolbarButton>

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
//                 isActive={editor.isActive('heading', { level: 2 })}
//                 title="Heading 2"
//               >
//                 <Heading2 size={16} />
//               </ToolbarButton>

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
//                 isActive={editor.isActive('heading', { level: 3 })}
//                 title="Heading 3"
//               >
//                 <Heading3 size={16} />
//               </ToolbarButton>

//               <div className="w-px h-6 bg-gray-300 mx-2" />

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleBold().run()}
//                 isActive={editor.isActive('bold')}
//                 title="Bold"
//               >
//                 <Bold size={16} />
//               </ToolbarButton>

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleItalic().run()}
//                 isActive={editor.isActive('italic')}
//                 title="Italic"
//               >
//                 <Italic size={16} />
//               </ToolbarButton>

//               <div className="w-px h-6 bg-gray-300 mx-2" />

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleBulletList().run()}
//                 isActive={editor.isActive('bulletList')}
//                 title="Bullet List"
//               >
//                 <List size={16} />
//               </ToolbarButton>

//               <ToolbarButton
//                 onClick={() => editor.chain().focus().toggleOrderedList().run()}
//                 isActive={editor.isActive('orderedList')}
//                 title="Numbered List"
//               >
//                 <ListOrdered size={16} />
//               </ToolbarButton>
//             </>
//           )}
//         </div>

//         {/* Preview Toggle Button */}
//         <ToolbarButton onClick={togglePreview} isActive={isPreview} title={isPreview ? 'Edit Mode' : 'Preview Mode'}>
//           {isPreview ? <Edit3 size={16} /> : <Eye size={16} />}
//         </ToolbarButton>
//       </div>

//       {/* Content Area */}
//       {isPreview ? (
//         <div className="p-4 bg-white">
//           <div className="preview-content" dangerouslySetInnerHTML={{ __html: editor.getHTML() }} />
//         </div>
//       ) : (
//         <div className="flex-1 overflow-y-auto">
//           <EditorContent editor={editor} />
//         </div>
//       )}
//     </div>
//   );
// };

// export default SimpleEditor;

'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';
import { EditorToolbar } from './syllabus-editor';

export const SimpleEditor = () => {
  const [isPreview, setIsPreview] = useState(false);

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
