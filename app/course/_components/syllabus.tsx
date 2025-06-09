'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState, useEffect, useCallback } from 'react';
import { EditorToolbar } from './syllabus-editor';
import { Save, RefreshCw } from 'lucide-react';

interface SimpleEditorProps {
  courseCode?: string;
}

export const SimpleEditor = ({ courseCode }: SimpleEditorProps) => {
  const [isPreview, setIsPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Loading syllabus...</p>',
    editorProps: {
      attributes: {
        class: 'prose max-w-none p-4 focus:outline-none min-h-[400px]',
      },
    },
    onUpdate: () => {
      setHasChanges(true);
      setError(null);
    },
  });

  // Fetch syllabus data
  const fetchSyllabus = useCallback(async () => {
    if (!courseCode || !editor) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseCode}/syllabus`);
      const result = await response.json();

      if (result.success) {
        const syllabusContent = result.data.syllabus || '<p>Start writing your course syllabus here...</p>';
        editor.commands.setContent(syllabusContent);
        setHasChanges(false);
      } else {
        setError(result.message || 'Failed to load syllabus');
        editor.commands.setContent('<p>Failed to load syllabus. Please try again.</p>');
      }
    } catch (err) {
      console.error('Error fetching syllabus:', err);
      setError('Network error while loading syllabus');
      editor.commands.setContent('<p>Error loading syllabus. Please check your connection and try again.</p>');
    } finally {
      setLoading(false);
    }
  }, [courseCode, editor]);

  // Save syllabus data
  const saveSyllabus = useCallback(async () => {
    if (!courseCode || !editor || !hasChanges) return;

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseCode}/syllabus`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          syllabus: editor.getHTML(),
          updated_by: 1, // TODO: Get actual user ID from auth session
        }),
      });

      const result = await response.json();

      if (result.success) {
        setHasChanges(false);
        setLastSaved(new Date());
      } else {
        setError(result.message || 'Failed to save syllabus');
      }
    } catch (err) {
      console.error('Error saving syllabus:', err);
      setError('Network error while saving syllabus');
    } finally {
      setSaving(false);
    }
  }, [courseCode, editor, hasChanges]);

  // Load syllabus when component mounts or courseCode changes
  useEffect(() => {
    if (courseCode && editor) {
      fetchSyllabus();
    }
  }, [courseCode, editor, fetchSyllabus]);

  // Auto-save functionality (optional)
  useEffect(() => {
    if (!hasChanges || !courseCode) return;

    const autoSaveTimer = setTimeout(() => {
      saveSyllabus();
    }, 5000); // Auto-save after 5 seconds of inactivity

    return () => clearTimeout(autoSaveTimer);
  }, [hasChanges, saveSyllabus, courseCode]);

  if (!editor) return null;
  return (
    <div className={`border rounded-lg overflow-hidden ${!isPreview ? 'flex flex-col max-h-[500px]' : ''}`}>
      {/* Header with toolbar and save controls */}
      <div className="border-b bg-gray-50">
        <EditorToolbar editor={editor} isPreview={isPreview} onTogglePreview={() => setIsPreview(!isPreview)} />

        {/* Save controls and status */}
        <div className="flex items-center justify-between px-4 py-2 text-sm text-gray-600 border-t">
          <div className="flex items-center gap-4">
            {/* Save button */}
            <button
              onClick={saveSyllabus}
              disabled={!hasChanges || saving || loading}
              className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${
                hasChanges && !saving && !loading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save'}
            </button>

            {/* Refresh button */}
            <button
              onClick={fetchSyllabus}
              disabled={loading || saving}
              className="flex items-center gap-2 px-3 py-1 rounded text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicators */}
            {loading && <span className="text-blue-600">Loading...</span>}
            {hasChanges && !saving && !loading && <span className="text-orange-600">Unsaved changes</span>}
            {lastSaved && !hasChanges && !loading && (
              <span className="text-green-600">Saved {lastSaved.toLocaleTimeString()}</span>
            )}
            {error && (
              <span className="text-red-600" title={error}>
                ⚠ Error saving
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 m-2 rounded">
          <div className="flex items-center">
            <div className="text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {/* Editor content */}
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
