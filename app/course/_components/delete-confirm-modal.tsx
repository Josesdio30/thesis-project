'use client';

import { useState } from 'react';
import { FaExclamationTriangle, FaTimes, FaTrash } from 'react-icons/fa';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Resource {
  id?: number;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size?: number;
  file_tittle?: string; // Add file_tittle field
}

interface DeleteConfirmModalProps {
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

const DeleteConfirmModal = ({ resource, isOpen, onClose, onConfirm, isDeleting = false }: DeleteConfirmModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && !isDeleting && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <FaExclamationTriangle />
            Confirm Delete
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The resource will be permanently removed from the session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resource Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Resource to be deleted:</h4>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {resource.file_type === 'pdf' && '📖'}
                {resource.file_type === 'video' && '🎥'}
                {resource.file_type === 'link' && '🔗'}
                {!['pdf', 'video', 'link'].includes(resource.file_type) && '📄'}
              </span>{' '}
              <div>
                <p className="font-medium text-gray-800">{resource.file_tittle || resource.file_name}</p>                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="capitalize">{resource.file_type} file</span>
                  {resource.file_size && resource.file_size > 0 && resource.file_type !== 'link' && (
                    <>
                      <span>•</span>
                      <span>{(resource.file_size / 1024 / 1024).toFixed(2)} MB</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-red-800">Warning:</p>
                <p className="text-red-700">
                  This will permanently delete the resource from the database and remove the physical file from the
                  server. Students will no longer be able to access this resource.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting} className="flex-1">
              <FaTimes className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={isDeleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <FaTrash className="mr-2 h-4 w-4" />
                  Delete Resource
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmModal;
