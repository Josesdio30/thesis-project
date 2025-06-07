'use client';

import { useState } from 'react';
import { FaFile, FaVideo, FaLink, FaUpload } from 'react-icons/fa';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface UploadModalProps {
  type: 'file' | 'video' | 'link';
  courseCode?: string;
  sessionId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const UploadModal = ({ type, courseCode, sessionId, isOpen, onClose, onSuccess }: UploadModalProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  //   const handleSubmit = async (e: React.FormEvent) => {
  //     e.preventDefault();
  //     setUploading(true);

  //     try {
  //       if (type === 'link') {
  //         // Handle link addition
  //         const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
  //           method: 'POST',
  //           headers: { 'Content-Type': 'application/json' },
  //           body: JSON.stringify({
  //             title,
  //             description,
  //             file_url: url,
  //             file_type: 'link',
  //             file_name: title,
  //           }),
  //         });

  //         if (response.ok) {
  //           onSuccess();
  //           handleClose();
  //         } else {
  //           throw new Error('Failed to save link');
  //         }
  //       } else {
  //         // Handle file/video upload
  //         if (!file) {
  //           alert('Please select a file');
  //           return;
  //         }

  //         const formData = new FormData();
  //         formData.append('file', file);
  //         formData.append('courseCode', courseCode || '');
  //         formData.append('sessionId', sessionId.toString());

  //         const uploadResponse = await fetch('/api/upload', {
  //           method: 'POST',
  //           body: formData,
  //         });

  //         const uploadResult = await uploadResponse.json();

  //         if (uploadResponse.ok) {
  //           // Save to database
  //           const saveResponse = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
  //             method: 'POST',
  //             headers: { 'Content-Type': 'application/json' },
  //             body: JSON.stringify({
  //               title: title || file.name,
  //               description,
  //               file_url: uploadResult.data.url,
  //               file_type: type,
  //               file_name: uploadResult.data.filename,
  //             }),
  //           });

  //           if (saveResponse.ok) {
  //             onSuccess();
  //             handleClose();
  //           } else {
  //             throw new Error('Failed to save file');
  //           }
  //         } else {
  //           throw new Error(uploadResult.error || 'Upload failed');
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error:', error);
  //       alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //     } finally {
  //       setUploading(false);
  //     }
  //   };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      if (type === 'link') {
        console.log('=== LINK UPLOAD STARTED ===');
        console.log('Course Code:', courseCode);
        console.log('Session ID:', sessionId);
        console.log('Data:', { title, description, url });

        // Handle link addition
        const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            file_url: url,
            file_type: 'link',
            file_name: title,
          }),
        });

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        const responseData = await response.json();
        console.log('Response data:', responseData);

        if (response.ok) {
          console.log('✅ Link saved successfully');
          onSuccess();
          handleClose();
        } else {
          console.error('❌ Failed to save link:', responseData);
          throw new Error(responseData.error || responseData.details || 'Failed to save link');
        }
      } else {
        console.log('=== FILE UPLOAD STARTED ===');
        // Handle file/video upload
        if (!file) {
          alert('Please select a file');
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('courseCode', courseCode || '');
        formData.append('sessionId', sessionId.toString());

        console.log('Uploading file:', file.name);
        console.log('Course Code:', courseCode);
        console.log('Session ID:', sessionId);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        console.log('Upload response status:', uploadResponse.status);
        const uploadResult = await uploadResponse.json();
        console.log('Upload result:', uploadResult);

        if (uploadResponse.ok) {
          // Save to database
          console.log('File uploaded, now saving to database...');
          const saveResponse = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title || file.name,
              description,
              file_url: uploadResult.data.url,
              file_type: type,
              file_name: uploadResult.data.filename,
            }),
          });

          console.log('Save response status:', saveResponse.status);
          const saveResult = await saveResponse.json();
          console.log('Save result:', saveResult);

          if (saveResponse.ok) {
            console.log('✅ File saved successfully');
            onSuccess();
            handleClose();
          } else {
            console.error('❌ Failed to save file:', saveResult);
            throw new Error(saveResult.error || saveResult.details || 'Failed to save file');
          }
        } else {
          console.error('❌ Upload failed:', uploadResult);
          throw new Error(uploadResult.error || uploadResult.details || 'Upload failed');
        }
      }
    } catch (error) {
      console.error('=== UPLOAD ERROR ===');
      console.error('Error:', error);
      console.error('==================');

      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setFile(null);
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'file':
        return <FaFile className="text-blue-600" />;
      case 'video':
        return <FaVideo className="text-red-600" />;
      case 'link':
        return <FaLink className="text-green-600" />;
      default:
        return <FaFile className="text-blue-600" />;
    }
  };

  const getTitle = () => {
    return `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  };

  const getDescription = () => {
    switch (type) {
      case 'file':
        return 'Upload a file to this session for students to download.';
      case 'video':
        return 'Upload a video file for this session.';
      case 'link':
        return 'Add an external link as a resource for this session.';
      default:
        return 'Add content to this session.';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter content title"
              required
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
              rows={3}
              disabled={uploading}
            />
          </div>

          {type === 'link' ? (
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
                disabled={uploading}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="file">{type === 'video' ? 'Video File' : 'File'}</Label>
              <Input
                id="file"
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                accept={type === 'video' ? 'video/*' : '*'}
                required
                disabled={uploading}
                className="cursor-pointer"
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={uploading} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={uploading} className="flex-1">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FaUpload className="mr-2 h-4 w-4" />
                  Add Content
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UploadModal;
