'use client';

import Sidebar from '../../_components/sidebar';
import Topbar from '../../_components/topbar';
import Footer from '@/components/common/footer';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Forum from '../_components/forum';
import Session from '../_components/session';
import People from '../_components/people';
import SimpleEditor from '../_components/syllabus';
import AssignmentTab from '../_components/assignment';
import ScoreTab from '../_components/score';

const CourseDetail = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = typeof params === 'object' && 'code' in params ? params['code'] : null;

  // Get sessionId and tab from URL search params
  const sessionIdParam = searchParams.get('sessionId');
  const tabParam = searchParams.get('tab');
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Session');
  const [activeSession, setActiveSession] = useState(1);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (!code) return;
    const fetchCourse = async () => {
      try {
        const res = await fetch(`/api/courses/${code}`);
        const data = await res.json();
        const courseData = data.data || null;
        setCourse(courseData);

        if (sessionIdParam) {
          const sessionId = parseInt(sessionIdParam);
          if (!isNaN(sessionId)) {
            setActiveSession(sessionId);
            setActiveTab('Session');
          }
        } else if (courseData?.class_courses?.[0]?.sessions?.length > 0) {
          // Default to first session if no URL parameter
          const firstSession = courseData.class_courses[0].sessions[0];
          setActiveSession(firstSession.id);
        }

        // Set active tab from URL parameter
        if (tabParam && ['Session', 'Syllabus', 'Assignment', 'Forum', 'Scoring', 'People'].includes(tabParam)) {
          setActiveTab(tabParam);
        }
      } catch (err) {
        setCourse(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [code, sessionIdParam]);
  if (loading) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading course...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-screen w-full overflow-hidden">
        <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
        <div className="flex-1 bg-gray-50 min-w-0">
          <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Course Not Found</h2>
              <p className="text-gray-600 mb-4">The course you're looking for doesn't exist.</p>
              <Link
                href="/course"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Courses
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const classCourse = course.class_courses?.[0];
  const teacher = classCourse?.teacher || {};
  const students = classCourse?.students || [];
  const sessions = classCourse?.sessions || [];

  return (
    // <div className="flex min-h-screen w-full overflow-hidden">
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        {/* Topbar */}
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 lg:p-8">
            {/* Course Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <Link
                  href="/course"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-800 shadow-md hover:bg-gray-300 flex-shrink-0"
                >
                  ⬅
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <h1 className="text-xl md:text-2xl font-bold text-gray-800 break-words">{course.course_name}</h1>
                  </div>
                  <div className="flex flex-wrap items-center mt-1 gap-2 text-sm md:text-base">
                    <span className="text-gray-600">🔢 {course.course_code}</span>
                    <span className="text-gray-600 hidden sm:inline">•</span>
                    <span className="text-gray-600">📚 {classCourse?.class_name}</span>
                  </div>
                  <div className="flex items-center mt-1 text-sm md:text-base">
                    <span className="text-gray-600 mr-2">👤</span>
                    <span className="text-gray-600 break-words">{teacher?.nama_lengkap}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Tab Navigation - BACK TO ORIGINAL */}
            <div className="flex border-b border-gray-300 mb-6 overflow-x-auto">
              {['Session', 'Syllabus', 'Assignment', 'Forum', 'Scoring', 'People'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-gray-700 font-semibold text-base whitespace-nowrap ${
                    activeTab === tab ? 'border-b-4 border-blue-500 text-blue-500' : 'hover:text-blue-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Tab Content */}{' '}
            {activeTab === 'Session' && (
              <Session
                sessions={sessions}
                activeSession={activeSession}
                setActiveSession={setActiveSession}
                courseCode={code as string}
              />
            )}{' '}
            {activeTab === 'Syllabus' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <SimpleEditor courseCode={code as string} />
              </div>
            )}{' '}
            {activeTab === 'Forum' && (
              <div>
                <Forum courseCode={code as string} sessions={sessions} />
              </div>
            )}
            {activeTab === 'Assignment' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <AssignmentTab courseCode={code as string} sessionId={activeSession} />
              </div>
            )}
            {activeTab === 'Scoring' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <ScoreTab courseCode={code as string} className={course?.class_courses?.[0]?.classes?.class_name} />
              </div>
            )}
            {activeTab === 'People' && <People courseCode={code as string} />}
            {!['Session', 'Syllabus', 'Forum', 'Assignment', 'Scoring', 'People'].includes(activeTab) && (
              <div>
                <p className="text-gray-700">Content for {activeTab} will be added here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default CourseDetail;
