'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaBookOpen,
  FaClock,
  FaDownload,
  FaExternalLinkAlt,
  FaFile,
  FaVideo,
  FaLink,
  FaPlus,
} from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Sidebar from '../../../../_components/sidebar';
import Topbar from '../../../../_components/topbar';
import Footer from '@/components/common/footer';
import UploadModal from '../../../_components/upload-modal';
import { Resource, Material } from '@/types';

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

interface SessionPageData {
  session: SessionData;
  course: {
    course_code: string;
    course_name: string;
  };
  allSessions: Array<{
    id: number;
    session_number: number;
    title: string;
  }>;
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

const formatTime = (timeString: string) => {
  if (!timeString) return 'Not set';

  try {
    let date: Date;
    if (timeString.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
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
    }

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
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

const SessionPage = () => {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;
  const courseCode = params?.code as string;

  const [sessionData, setSessionData] = useState<SessionPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionResources, setSessionResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'file' | 'video' | 'link'>('file');

  // Fetch session data
  const fetchSessionData = async () => {
    if (!courseCode || !sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}`);
      const result = await response.json();

      if (result.success && result.data) {
        setSessionData(result.data);
      } else {
        setError('Failed to fetch session data');
        console.error('Failed to fetch session data:', result.error);
      }
    } catch (error) {
      setError('Error fetching session data');
      console.error('Error fetching session data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch session resources
  const fetchResources = async () => {
    if (!courseCode || !sessionId) return;

    setLoadingResources(true);
    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}/resources`);
      const result = await response.json();

      if (result.success) {
        setSessionResources(result.data || []);
      } else {
        console.error('Failed to fetch resources:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch resources:', error);
    } finally {
      setLoadingResources(false);
    }
  };

  // Navigation handlers
  const navigateToSession = (newSessionId: number) => {
    router.push(`/course/${courseCode}/session/${newSessionId}`);
  };

  const goBackToCourse = () => {
    router.push(`/course/${courseCode}`);
  };

  // Upload handlers
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
    setIsUploadModalOpen(false);
    fetchResources(); // Refresh resources
  };

  useEffect(() => {
    fetchSessionData();
  }, [courseCode, sessionId]);

  useEffect(() => {
    if (sessionData) {
      fetchResources();
    }
  }, [sessionData, courseCode, sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading session...</p>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={goBackToCourse}>
                <FaArrowLeft className="mr-2" />
                Back to Course
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Session Not Found</h3>
              <p className="text-gray-600 mb-4">The requested session could not be found.</p>
              <Button onClick={goBackToCourse}>
                <FaArrowLeft className="mr-2" />
                Back to Course
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  const { session, course, allSessions } = sessionData;

  return (
    <div className="flex min-h-screen w-full overflow-hidden">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 bg-gray-50 min-w-0">
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />

        <main className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={goBackToCourse}>
                <FaArrowLeft className="mr-2" />
                Back to {course.course_name}
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Session {session.session_number}: {session.title}
                </h1>
                <p className="text-gray-600">{course.course_code}</p>
              </div>
            </div>
          </div>

          {/* Session Navigation */}
          <div className="flex space-x-3 overflow-x-auto pb-2">
            {allSessions.map(s => (
              <button
                key={s.id}
                onClick={() => navigateToSession(s.id)}
                className={cn(
                  'px-4 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap flex-shrink-0',
                  s.id === session.id
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
                )}
              >
                Session {s.session_number}
              </button>
            ))}
          </div>

          {/* Main Content */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Session Content */}
            <div className="flex-1">
              <Card>
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
                                {material.content && <p className="text-gray-600 text-sm mt-1">{material.content}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 italic">No materials available for this session.</p>
                      )}
                    </div>
                  </div>

                  {/* Session Time */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                        <FaClock className="text-sm" />
                        Start Time
                      </div>
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
                    <div className="bg-blue-50 rounded-lg p-4">
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
            </div>

            {/* Sidebar */}
            <div className="lg:w-80">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">Session Resources</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Resources Section */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <FaDownload className="text-sm text-blue-600" />
                      Available Resources
                    </h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {loadingResources ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="ml-2 text-gray-600 text-sm">Loading...</span>
                        </div>
                      ) : sessionResources?.length ? (
                        sessionResources.map((resource, index) => (
                          <a
                            key={resource.id || index}
                            href={resource.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 hover:border-blue-300"
                          >
                            <span className="text-lg">{getResourceIcon(resource.file_type)}</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-700 truncate block font-medium">
                                {resource.file_name}
                              </span>
                              <p className="text-xs text-gray-500 capitalize">{resource.file_type} file</p>
                            </div>
                            <FaExternalLinkAlt className="text-xs text-gray-400" />
                          </a>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 italic">No resources available</p>
                      )}
                    </div>
                  </div>

                  {/* Add Content Floating Action Button */}
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
                          onClick={handleAddFile}
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
                          onClick={handleAddVideo}
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
                          onClick={handleAddLink}
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
            </div>
          </div>
        </main>

        {/* Upload Modal */}
        {isUploadModalOpen && (
          <UploadModal
            type={uploadType}
            courseCode={courseCode}
            sessionId={parseInt(sessionId)}
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onSuccess={handleUploadSuccess}
          />
        )}
        <Footer />
      </div>
    </div>
  );
};

export default SessionPage;
