'use client';

import { useState } from 'react';
import { FaFile, FaDownload, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface FilePreviewProps {
  file: {
    file_name: string;
    file_url: string;
    file_type: string;
    title?: string;
    description?: string;
  };
  isOpen: boolean;
  onClose: () => void;
}

const FilePreview = ({ file, isOpen, onClose }: FilePreviewProps) => {
  const [loading, setLoading] = useState(true);

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const isImage = (fileType: string, filename: string) => {
    const ext = getFileExtension(filename);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || fileType.startsWith('image/');
  };

  const isPDF = (fileType: string, filename: string) => {
    const ext = getFileExtension(filename);
    return ext === 'pdf' || fileType === 'application/pdf';
  };

  const isVideo = (fileType: string, filename: string) => {
    const ext = getFileExtension(filename);
    return ['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext) || fileType.startsWith('video/');
  };

  const isAudio = (fileType: string, filename: string) => {
    const ext = getFileExtension(filename);
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext) || fileType.startsWith('audio/');
  };

  const isText = (fileType: string, filename: string) => {
    const ext = getFileExtension(filename);
    return ['txt', 'md', 'json', 'xml', 'csv'].includes(ext) || fileType.startsWith('text/');
  };

  const renderPreview = () => {
    if (file.file_type === 'link') {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
          <FaExternalLinkAlt className="text-4xl text-blue-500 mb-4" />
          <p className="text-gray-600 mb-4">External Link</p>
          <Button asChild>
            <a href={file.file_url} target="_blank" rel="noopener noreferrer">
              Open Link
            </a>
          </Button>
        </div>
      );
    }

    if (isImage(file.file_type, file.file_name)) {
      return (
        <div className="flex justify-center">
          <img
            src={file.file_url}
            alt={file.file_name}
            className="max-w-full max-h-96 object-contain rounded-lg"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>
      );
    }

    if (isPDF(file.file_type, file.file_name)) {
      return (
        <div className="w-full h-96">
          <iframe src={file.file_url} className="w-full h-full rounded-lg border" onLoad={() => setLoading(false)} />
        </div>
      );
    }

    if (isVideo(file.file_type, file.file_name)) {
      return (
        <div className="flex justify-center">
          <video controls className="max-w-full max-h-96 rounded-lg" onLoadedData={() => setLoading(false)}>
            <source src={file.file_url} type={file.file_type} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isAudio(file.file_type, file.file_name)) {
      return (
        <div className="flex flex-col items-center justify-center h-32 bg-gray-50 rounded-lg">
          <audio controls className="w-full max-w-md" onLoadedData={() => setLoading(false)}>
            <source src={file.file_url} type={file.file_type} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    // Default: Show download option
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
        <FaFile className="text-4xl text-gray-400 mb-4" />
        <p className="text-gray-600 mb-2">Cannot preview this file type</p>
        <p className="text-sm text-gray-500 mb-4">{file.file_name}</p>
        <Button asChild>
          <a href={file.file_url} download target="_blank" rel="noopener noreferrer">
            <FaDownload className="mr-2" />
            Download File
          </a>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{file.title || file.file_name}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={file.file_url} download target="_blank" rel="noopener noreferrer">
                  <FaDownload className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            </div>
          </DialogTitle>
          {file.description && <p className="text-sm text-gray-600">{file.description}</p>}
        </DialogHeader>

        <div className="mt-4">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FilePreview;
