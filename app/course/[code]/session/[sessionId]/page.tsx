'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FaArrowLeft, FaSpinner } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import Sidebar from '../../../../_components/sidebar';
import Topbar from '../../../../_components/topbar';
import Footer from '@/components/common/footer';
import SessionComponent from '../../../_components/session';

interface SessionData {
  id: number;
  session_number: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  materials?: any[];
  resources?: any[];
}

interface SessionPageData {
  session: SessionData;
  course: {
    course_code: string;
    course_name: string;
  };
  allSessions: {
    id: number;
    session_number: number;
    title: string;
  }[];
}

const SessionPage = () => {
  const params = useParams();
  const router = useRouter();
  const sessionId = parseInt(params?.sessionId as string);
  const courseCode = params?.code as string;

  const [sessionData, setSessionData] = useState<SessionPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<number>(sessionId);

  // Fetch session data and all sessions for the course
  const fetchSessionData = async () => {
    if (!courseCode || !sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseCode}/sessions/${sessionId}`);
      const result = await response.json();

      if (result.success && result.data) {
        setSessionData(result.data);
        setActiveSession(sessionId);
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

  // Navigate to different session
  const handleSessionChange = (newSessionId: number) => {
    setActiveSession(newSessionId);
    router.push(`/course/${courseCode}/session/${newSessionId}`);
  };

  // Go back to course
  const goBackToCourse = () => {
    router.push(`/course/${courseCode}`);
  };

  useEffect(() => {
    fetchSessionData();
  }, [courseCode, sessionId]);

  // Update active session when route changes
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <FaSpinner className="animate-spin text-blue-500 text-4xl mx-auto mb-4" />
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
                {/* Back to {course.course_name} */}
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Session {session.session_number}: {session.title}
                </h1>
                <p className="text-gray-600">{course.course_code}</p>
              </div>
            </div>
          </div>{' '}
          {/* Session Component */}
          <SessionComponent
            sessions={allSessions.map(s => ({
              ...s,
              description: s.id === session.id ? session.description : undefined,
              start_time: s.id === session.id ? session.start_time : '',
              end_time: s.id === session.id ? session.end_time : '',
              materials: s.id === session.id ? session.materials : [],
              resources: [],
            }))}
            activeSession={activeSession}
            setActiveSession={handleSessionChange}
            courseCode={courseCode}
          />
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default SessionPage;
