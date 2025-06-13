'use client';

import { useState, useEffect } from 'react';
import {
  FaBookOpen,
  FaPlus,
  FaEdit,
  FaTrash,
  FaGripVertical,
  FaChevronDown,
  FaChevronUp,
  FaSave,
  FaTimes,
  FaSpinner,
} from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { Skeleton } from '@/components/ui/skeleton';
import TextEditor from '@/components/ui/text-editor';

interface Material {
  id: number;
  session_id: number;
  title: string;
  content?: string;
  material_order: number;
  created_at?: string;
}

interface MaterialsProps {
  sessionId: number;
  courseCode?: string;
  className?: string;
}

interface MaterialFormData {
  title: string;
  content: string;
}

// Loading skeleton for materials
const MaterialsSkeleton = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 mb-4">
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-6 w-32" />
    </div>
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-50 rounded-lg p-4">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  </div>
);

// Individual material item component
const MaterialItem = ({
  material,
  canEdit,
  onEdit,
  onDelete,
  onReorder,
}: {
  material: Material;
  canEdit: boolean;
  onEdit: (material: Material) => void;
  onDelete: (id: number) => void;
  onReorder: (id: number, direction: 'up' | 'down') => void;
}) => {
  // const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = material.content && material.content.trim().length > 0;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag handle for reordering (teachers only) */}
          {/* {canEdit && (
            <div className="flex flex-col gap-1 mt-1">
              <button
                onClick={() => onReorder(material.id, 'up')}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Move up"
              >
                <FaChevronUp className="text-xs" />
              </button>
              <FaGripVertical className="text-gray-400 text-sm cursor-move" />
              <button
                onClick={() => onReorder(material.id, 'down')}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Move down"
              >
                <FaChevronDown className="text-xs" />
              </button>
            </div>
          )} */}

          {/* Material content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {' '}
              <div className="flex-1">
                <h5 className="font-bold text-gray-800 mb-1">{material.title}</h5>
                {/* {hasContent && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-sm text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
                  >
                    {isExpanded ? (
                      <>
                        <FaChevronUp className="text-xs" />
                        Hide details
                      </>
                    ) : (
                      <>
                        <FaChevronDown className="text-xs" />
                        Show details
                      </>
                    )}
                  </button>
                )} */}
              </div>
              {/* Action buttons for teachers */}
              {canEdit && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(material)}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit material"
                  >
                    <FaEdit className="text-xs" />
                  </button>
                  <button
                    onClick={() => onDelete(material.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete material"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              )}
            </div>{' '}
            {/* Content always visible now */}
            {hasContent && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div
                  className="preview-syllabus-content text-sm"
                  dangerouslySetInnerHTML={{ __html: material.content || '' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Material form for adding/editing
const MaterialForm = ({
  material,
  onSave,
  onCancel,
  isLoading,
}: {
  material?: Material;
  onSave: (data: MaterialFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) => {
  const [formData, setFormData] = useState<MaterialFormData>({
    title: material?.title || '',
    content: material?.content || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      onSave(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-300 rounded-lg p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Material Title *</label>
          <Input
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            placeholder="Enter material title..."
            disabled={isLoading}
            required
          />
        </div>{' '}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
          <TextEditor
            content={formData.content}
            onChange={content => setFormData({ ...formData, content })}
            placeholder="Enter material content or description..."
            disabled={isLoading}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!formData.title.trim() || isLoading} className="flex items-center gap-2">
            {isLoading ? <FaSpinner className="animate-spin" /> : <FaSave />}
            {material ? 'Update' : 'Add'} Material
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            <FaTimes className="mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
};

// Main Materials component
const Materials = ({ sessionId, courseCode, className }: MaterialsProps) => {
  const { data: sessionData } = useSession();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [saving, setSaving] = useState(false);

  // Check if user can edit materials (teachers and admins only)
  const canEdit = sessionData?.user?.role === 'TEACHER' || sessionData?.user?.role === 'ADMIN';

  // Fetch materials
  const fetchMaterials = async () => {
    if (!courseCode || !sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/materials`);
      const result = await response.json();

      if (result.success) {
        setMaterials(result.data || []);
      } else {
        setError(result.error || 'Failed to fetch materials');
      }
    } catch (err) {
      console.error('Failed to fetch materials:', err);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Save material (add or update)
  const saveMaterial = async (data: MaterialFormData) => {
    if (!courseCode || !sessionId) return;

    setSaving(true);
    try {
      const url = editingMaterial
        ? `/api/courses/${courseCode}/sessions/${sessionId}/materials/${editingMaterial.id}`
        : `/api/courses/${courseCode}/sessions/${sessionId}/materials`;

      const method = editingMaterial ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        await fetchMaterials(); // Refresh the list
        setIsFormOpen(false);
        setEditingMaterial(null);
      } else {
        setError(result.error || 'Failed to save material');
      }
    } catch (err) {
      console.error('Failed to save material:', err);
      setError('Network error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Delete material
  const deleteMaterial = async (id: number) => {
    if (!courseCode || !sessionId || !confirm('Are you sure you want to delete this material?')) return;

    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/materials/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        await fetchMaterials(); // Refresh the list
      } else {
        setError(result.error || 'Failed to delete material');
      }
    } catch (err) {
      console.error('Failed to delete material:', err);
      setError('Network error occurred');
    }
  };

  // Reorder materials
  const reorderMaterial = async (id: number, direction: 'up' | 'down') => {
    if (!courseCode || !sessionId) return;

    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/materials/${id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });

      const result = await response.json();

      if (result.success) {
        await fetchMaterials(); // Refresh the list
      } else {
        setError(result.error || 'Failed to reorder material');
      }
    } catch (err) {
      console.error('Failed to reorder material:', err);
      setError('Network error occurred');
    }
  };

  // Edit material
  const editMaterial = (material: Material) => {
    setEditingMaterial(material);
    setIsFormOpen(true);
  };

  // Cancel form
  const cancelForm = () => {
    setIsFormOpen(false);
    setEditingMaterial(null);
  };

  // Add new material
  const addMaterial = () => {
    setEditingMaterial(null);
    setIsFormOpen(true);
  };

  useEffect(() => {
    fetchMaterials();
  }, [sessionId, courseCode]);

  return (
    <div className={cn('mb-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          {/* <FaBookOpen className="text-sm text-blue-600" />
          Course Materials */}
          {/* {materials.length > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{materials.length}</span>
          )} */}
        </h4>

        {canEdit && !isFormOpen && (
          <Button onClick={addMaterial} size="sm" className="flex items-center gap-2">
            <FaPlus className="text-xs" />
            Add Material
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Add/Edit form */}
      {isFormOpen && (
        <div className="mb-4">
          <MaterialForm
            material={editingMaterial || undefined}
            onSave={saveMaterial}
            onCancel={cancelForm}
            isLoading={saving}
          />
        </div>
      )}

      {/* Materials list */}
      {loading ? (
        <MaterialsSkeleton />
      ) : materials.length > 0 ? (
        <div className="space-y-3 group">
          {materials
            .sort((a, b) => a.material_order - b.material_order)
            .map(material => (
              <MaterialItem
                key={material.id}
                material={material}
                canEdit={canEdit}
                onEdit={editMaterial}
                onDelete={deleteMaterial}
                onReorder={reorderMaterial}
              />
            ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <FaBookOpen className="text-gray-400 text-2xl mx-auto mb-2" />
          <p className="text-gray-500 italic">
            {canEdit
              ? 'No materials yet. Click "Add Material" to get started.'
              : 'No materials available for this session.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Materials;
