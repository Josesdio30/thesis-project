'use client';

import { useState } from 'react';
import { FaFile, FaVideo, FaLink, FaUpload, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
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
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      if (type === 'link') {
        console.log('=== LINK UPLOAD STARTED ===');
        console.log('Course Code:', courseCode);
        console.log('Session ID:', sessionId);
        console.log('Data:', { title, url });

        // Handle link addition
        const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            file_url: url,
            file_type: 'link',
            file_name: title,
            file_tittle: title, // Add file_tittle field for links
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
          console.log('Upload result file_extension:', uploadResult.data.file_extension);
          console.log('Upload result content_type:', uploadResult.data.content_type);

          const saveResponse = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title || file.name,
              file_url: uploadResult.data.url,
              file_type: uploadResult.data.file_extension, // Use actual file extension
              file_name: uploadResult.data.filename,
              file_tittle: title || file.name, // Add file_tittle field for files
              file_size: uploadResult.data.size,
              content_type: uploadResult.data.content_type, // Use proper MIME type
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
          {/* {type === 'link' ? (
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
          </div> */}
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

              {/* File size limit information */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <p className="text-sm text-blue-700 font-medium">Maximum file size: 10MB</p>
                </div>
                <p className="text-xs text-blue-600 mt-1">File larger than 10MB will be rejected during upload.</p>
              </div>

              {/* File selection feedback */}
              {file && (
                <div className="space-y-2">
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <p className="text-sm text-gray-700 font-medium">File: {file.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p
                        className={`text-sm font-medium ${
                          file.size > 10 * 1024 * 1024
                            ? 'text-red-600'
                            : file.size > 8 * 1024 * 1024
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}
                      >
                        Size: {(file.size / 1024 / 1024).toFixed(2)} MB / 10.00 MB
                      </p>
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          file.size > 10 * 1024 * 1024
                            ? 'bg-red-100 text-red-700'
                            : file.size > 8 * 1024 * 1024
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {file.size > 10 * 1024 * 1024 ? (
                          <FaExclamationTriangle />
                        ) : file.size > 8 * 1024 * 1024 ? (
                          <FaExclamationTriangle />
                        ) : (
                          <FaCheck />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Warning for files at or near 10MB */}
                  {file.size > 10 * 1024 * 1024 && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <div className="flex items-center gap-2">
                        {/* <span className="text-red-500 text-lg">🚫</span> */}
                        <div>
                          <p className="text-sm text-red-700 font-medium">File upload maximum 10MB</p>
                          <p className="text-xs text-red-600 mt-1">
                            Your file is {(file.size / 1024 / 1024).toFixed(2)}MB. Please choose a smaller file or
                            compress it to under 10MB.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warning for files between 8-10MB */}
                  {file.size > 8 * 1024 * 1024 && file.size <= 10 * 1024 * 1024 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-500 text-lg">⚠️</span>
                        <div>
                          <p className="text-sm text-yellow-700 font-medium">Large file detected</p>
                          <p className="text-xs text-yellow-600 mt-1">
                            Your file is {(file.size / 1024 / 1024).toFixed(2)}MB. Upload may take longer for large
                            files.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}{' '}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={uploading} className="flex-1">
              Cancel
            </Button>{' '}
            <Button
              type="submit"
              disabled={uploading || (file ? file.size > 10 * 1024 * 1024 : false)}
              className={`flex-1 ${
                file && file.size > 10 * 1024 * 1024 ? 'bg-red-500 hover:bg-red-600 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : file && file.size > 10 * 1024 * 1024 ? (
                <>
                  <span className="mr-2">🚫</span>
                  File Too Large
                </>
              ) : file && file.size > 8 * 1024 * 1024 ? (
                <>
                  <FaUpload className="mr-2 h-4 w-4" />
                  Upload Large File
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
