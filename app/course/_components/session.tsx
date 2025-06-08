'use client';

import { useState, useEffect } from 'react';
import {
  FaFile,
  FaVideo,
  FaLink,
  FaPlus,
  FaClock,
  FaBookOpen,
  FaDownload,
  FaExternalLinkAlt,
  FaTrash,
  FaEllipsisV,
} from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import UploadModal from './upload-modal';
import DeleteConfirmModal from './delete-confirm-modal';
import { useToast } from './toast';

interface Material {
  title: string;
  description?: string;
}

interface Resource {
  id?: number;
  file_name: string;
  file_url: string;
  file_type: 'pdf' | 'video' | 'link' | string;
  file_size?: number;
  content_type?: string;
  version?: number;
  is_public?: boolean;
  download_count?: number;
  uploader?: string;
  title?: string;
  description?: string;
  file_tittle?: string; // New field from database
}

interface SessionData {
  id: number;
  session_number: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  materials?: Material[];
  resources?: Resource[];
}

interface SessionProps {
  sessions: SessionData[];
  activeSession: number;
  setActiveSession: (id: number) => void;
  courseCode?: string;
  userRole?: string;
}

const getResourceIcon = (fileType: string) => {
  switch (fileType) {
    case 'pdf':
      return '📖';
    case 'video':
      return '🎥';
    case 'link':
      return '🔗';
    default:
      return '📄';
  }
};

const SessionSelector = ({
  sessions,
  activeSession,
  setActiveSession,
}: {
  sessions: SessionData[];
  activeSession: number;
  setActiveSession: (id: number) => void;
}) => (
  <div className="flex space-x-3 mb-6 overflow-x-auto pb-2">
    {sessions.map(session => (
      <button
        key={session.id}
        onClick={() => setActiveSession(session.id)}
        className={cn(
          'px-4 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap flex-shrink-0',
          activeSession === session.id
            ? 'bg-blue-500 text-white border-blue-500 shadow-md'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
        )}
      >
        Session {session.session_number}
      </button>
    ))}
  </div>
);

const formatTime = (timeString: string) => {
  if (!timeString) {
    return 'Not set';
  }

  try {
    let date: Date;
    const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
    const isTimeFormat = timeRegex.test(timeString);

    if (isTimeFormat) {
      const today = new Date();
      const [hours, minutes, seconds = '00'] = timeString.split(':');

      date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        parseInt(hours),
        parseInt(minutes),
        parseInt(seconds)
      );
    } else {
      date = new Date(timeString);

      if (timeString.includes('Z') || timeString.includes('+00:00')) {
        const utcHours = date.getUTCHours();
        const utcMinutes = date.getUTCMinutes();

        date = new Date();
        date.setHours(utcHours, utcMinutes, 0, 0);
      }
    }
    const formatted = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return formatted;
  } catch (error) {
    console.error('Invalid time format:', timeString, error);
    return timeString;
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return 'Not set';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (error) {
    return dateString;
  }
};

const SessionContent = ({ session, loadingResources }: { session: SessionData; loadingResources?: boolean }) => (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl">
        <FaBookOpen className="text-blue-600" />
        {session.title}
      </CardTitle>
      {session.description && <p className="text-gray-600 mt-2">{session.description}</p>}
    </CardHeader>
    <CardContent>
      {/* Materials Section */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FaBookOpen className="text-sm text-blue-600" />
          Course Materials
        </h4>
        <div className="bg-gray-50 rounded-lg p-4">
          {session.materials?.length ? (
            <ul className="space-y-2">
              {session.materials.map((material, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <div>
                    <span className="text-gray-800 font-medium">{material.title}</span>
                    {material.description && <p className="text-gray-600 text-sm mt-1">{material.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 italic">No materials available for this session.</p>
          )}
        </div>
      </div>{' '}
      {/* Session Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            Start Time
          </div>{' '}
          <p className="text-green-800 text-lg font-bold">{formatTime(session.start_time)}</p>
          <p className="text-green-600 text-sm mt-1">{formatDate(session.start_time)}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            End Time
          </div>
          <p className="text-red-800 text-lg font-bold">{formatTime(session.end_time)}</p>
          <p className="text-red-600 text-sm mt-1">{formatDate(session.end_time)}</p>
        </div>
      </div>
      {/* Session Duration */}
      {session.start_time && session.end_time && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
            <FaClock className="text-sm" />
            Session Duration
          </div>
          <p className="text-blue-800 text-lg font-bold">
            {(() => {
              try {
                const start = new Date(session.start_time);
                const end = new Date(session.end_time);
                const diffMs = end.getTime() - start.getTime();
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                if (diffHours > 0) {
                  return `${diffHours}h ${diffMinutes}m`;
                } else {
                  return `${diffMinutes}m`;
                }
              } catch {
                return 'Duration not available';
              }
            })()}
          </p>
        </div>
      )}
    </CardContent>
  </Card>
);

interface ActionsSidebarProps {
  session: SessionData;
  sessionResources: Resource[];
  loadingResources: boolean;
  isFabOpen: boolean;
  setIsFabOpen: (open: boolean) => void;
  onAddFile: () => void;
  onAddVideo: () => void;
  onAddLink: () => void;
  onDeleteResource: (resource: Resource) => void;
  courseCode?: string;
  userRole?: string;
}

const ActionsSidebar = ({
  session,
  sessionResources,
  loadingResources,
  isFabOpen,
  setIsFabOpen,
  onAddFile,
  onAddVideo,
  onAddLink,
  onDeleteResource,
  courseCode,
  userRole,
}: ActionsSidebarProps) => {
  const [resourceMenuOpen, setResourceMenuOpen] = useState<number | null>(null);
  const handleDeleteClick = async (resource: Resource) => {
    onDeleteResource(resource);
    setResourceMenuOpen(null);
  };

  const canManageResources = userRole === 'teacher' || userRole === 'admin';

  // Close resource menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setResourceMenuOpen(null);
    };

    if (resourceMenuOpen !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [resourceMenuOpen]);
  return (
    <Card className="lg:w-80 h-fit">
      <CardHeader>
        <CardTitle className="text-lg">Resources</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          {/* <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FaDownload className="text-sm text-blue-600" />
            Available Resources
          </h4> */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingResources ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600 text-sm">Loading...</span>
              </div>
            ) : sessionResources?.length ? (
              sessionResources.map((resource, index) => (
                <div
                  key={resource.id || index}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors group"
                >
                  <span className="text-lg">{getResourceIcon(resource.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    {' '}
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-700 truncate block font-medium hover:text-blue-600 transition-colors"
                    >
                      {resource.file_tittle || resource.file_name}
                    </a>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{resource.file_type} file</span>
                      {resource.file_size && (
                        <>
                          <span>•</span>
                          <span>{(resource.file_size / 1024 / 1024).toFixed(2)} MB</span>
                        </>
                      )}
                      {/* {resource.download_count !== undefined && (
                        <>
                          <span>•</span>
                          <span>{resource.download_count} downloads</span>
                        </>
                      )} */}
                    </div>
                  </div>

                  {/* Resource Actions */}
                  <div className="flex items-center gap-1">
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Open resource"
                    >
                      <FaExternalLinkAlt className="text-xs" />
                    </a>

                    {canManageResources && resource.id && (
                      <div className="relative">
                        {' '}
                        <button
                          onClick={() =>
                            setResourceMenuOpen(resourceMenuOpen === resource.id ? null : resource.id || null)
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="Resource actions"
                        >
                          <FaEllipsisV className="text-xs" />
                        </button>
                        {resourceMenuOpen === resource.id && (
                          <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[120px]">
                            <button
                              onClick={() => handleDeleteClick(resource)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
                            >
                              <FaTrash className="text-xs" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">No resources available</p>
            )}
          </div>
        </div>

        {/* Floating Action Button */}
        <div className="relative">
          <h4 className="font-semibold text-gray-800 mb-3">Add Content</h4>

          <div className="relative flex justify-center">
            <button
              onClick={() => setIsFabOpen(!isFabOpen)}
              className={cn(
                'w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all duration-300',
                isFabOpen && 'rotate-45'
              )}
            >
              <FaPlus className="text-lg" />
            </button>

            {/* Action Buttons */}
            <div className="absolute top-16 flex flex-col items-center space-y-3">
              <button
                onClick={onAddFile}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '0ms' }}
              >
                <FaFile className="text-blue-600" />
                <span className="text-sm">File</span>
              </button>

              <button
                onClick={onAddVideo}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '50ms' }}
              >
                <FaVideo className="text-red-600" />
                <span className="text-sm">Video</span>
              </button>

              <button
                onClick={onAddLink}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-full shadow-md hover:bg-gray-100 transition-all duration-300',
                  isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                )}
                style={{ transitionDelay: '100ms' }}
              >
                <FaLink className="text-green-600" />
                <span className="text-sm">Link</span>
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Session = ({ sessions, activeSession, setActiveSession, courseCode, userRole }: SessionProps) => {
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'file' | 'video' | 'link'>('file');
  // Resource management states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sessionResources, setSessionResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const { success, error, info, ToastContainer } = useToast();

  const currentSession = sessions.find(s => s.id === activeSession);
  const fetchResources = async () => {
    if (!courseCode || !activeSession) return;

    setLoadingResources(true);
    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${activeSession}/resources`);
      const result = await response.json();

      if (result.success) {
        setSessionResources(result.data);
      } else {
        error('Failed to fetch resources', result.error || 'Unknown error occurred');
      }
    } catch (err) {
      error('Failed to fetch resources', 'Network error occurred');
      console.error('Failed to fetch resources:', err);
    } finally {
      setLoadingResources(false);
    }
  };

  // ✅ FIXED: Handler functions defined in correct scope
  const handleAddFile = () => {
    setUploadType('file');
    setIsUploadModalOpen(true);
    setIsFabOpen(false);
  };

  const handleAddVideo = () => {
    setUploadType('video');
    setIsUploadModalOpen(true);
    setIsFabOpen(false);
  };

  const handleAddLink = () => {
    setUploadType('link');
    setIsUploadModalOpen(true);
    setIsFabOpen(false);
  };
  const handleUploadSuccess = () => {
    success('Resource uploaded', 'New resource has been successfully uploaded');
    setIsUploadModalOpen(false);
    fetchResources(); // Refresh resources instead of page reload
  };
  // Resource management handlers
  const handleDeleteResource = async (resource: Resource) => {
    setSelectedResource(resource);
    setIsDeleteModalOpen(true);
  };
  const confirmDeleteResource = async () => {
    if (!courseCode || !selectedResource?.id) return;

    setIsDeleting(true);
    try {
      console.log('=== RESOURCE DELETE STARTED ===');
      console.log('Course Code:', courseCode);
      console.log('Session ID:', activeSession);
      console.log('Resource ID:', selectedResource.id);

      const response = await fetch(
        `/api/courses/${courseCode}/sessions/${activeSession}/resources/${selectedResource.id}`,
        {
          method: 'DELETE',
        }
      );

      const result = await response.json();
      console.log('Delete response:', result);

      if (response.ok && result.success) {
        console.log('✅ Resource deleted successfully');
        success(
          'Resource deleted',
          `${selectedResource.file_tittle || selectedResource.file_name} has been successfully deleted`
        );
        setIsDeleteModalOpen(false);
        setSelectedResource(null);
        fetchResources(); // Refresh the resources list
      } else {
        console.error('❌ Failed to delete resource:', result);
        error('Delete failed', result.error || result.message || 'Unknown error occurred');
      }
    } catch (err) {
      console.error('=== DELETE ERROR ===');
      console.error('Error:', err);
      error('Delete failed', err instanceof Error ? err.message : 'Network error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [activeSession, courseCode]);

  if (!currentSession) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaBookOpen className="text-gray-400 text-xl" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Session Not Found</h3>
          <p className="text-gray-600">The selected session could not be found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SessionSelector sessions={sessions} activeSession={activeSession} setActiveSession={setActiveSession} />{' '}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <SessionContent
            session={{
              ...currentSession,
              resources: sessionResources, // Pass fetched resources
            }}
            loadingResources={loadingResources}
          />
        </div>{' '}
        <div className="lg:w-80">
          {' '}
          <ActionsSidebar
            session={{
              ...currentSession,
              resources: sessionResources, // Pass fetched resources here too
            }}
            sessionResources={sessionResources}
            loadingResources={loadingResources}
            isFabOpen={isFabOpen}
            setIsFabOpen={setIsFabOpen}
            onAddFile={handleAddFile}
            onAddVideo={handleAddVideo}
            onAddLink={handleAddLink}
            onDeleteResource={handleDeleteResource}
            courseCode={courseCode}
            userRole={userRole}
          />
        </div>
      </div>{' '}
      {/* Upload Modal */}
      {isUploadModalOpen && (
        <UploadModal
          type={uploadType}
          courseCode={courseCode}
          sessionId={activeSession}
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess} // Use new handler
        />
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedResource && (
        <DeleteConfirmModal
          resource={selectedResource}
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedResource(null);
          }}
          onConfirm={confirmDeleteResource}
          isDeleting={isDeleting}
        />
      )}
      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
};

export default Session;
