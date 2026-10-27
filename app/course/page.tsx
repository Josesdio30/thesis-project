'use client';

import Link from 'next/link';
import Sidebar from '../_components/sidebar';
import { useEffect, useState } from 'react';
import Footer from '@/components/common/footer';
import Topbar from '../_components/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FaBook, FaClipboard, FaCode, FaSpinner, FaUserFriends } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { buildClassScopedCourseQuery } from '@/lib/course-class-selection';

interface Course {
  id?: string;
  course_name: string;
  course_code: string;
  description: string;
  class_id?: number | null;
  class_name: string;
  grade_level: string;
}

const LoadingCard = () => (
  <Card className="animate-pulse">
    <CardHeader className="pb-3">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
    </CardHeader>
    <CardContent>
      <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
    </CardContent>
  </Card>
);

const CourseCard = ({ course }: { course: Course }) => (
  <Link
    href={{
      pathname: `/course/${course.course_code}`,
      query: buildClassScopedCourseQuery(course.course_code, course.class_id),
    }}
    className="block group"
  >
    <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-100">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <FaBook className="text-blue-600 text-lg" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                {course.course_name}
              </CardTitle>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-600 mt-2">
          {/* <FaCode className="text-xs" /> */}
          {/* <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{course.course_code}</span> */}
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-600 mt-2">
          {/* <FaClipboard className="text-xs" /> */}
          <FaClipboard className="text-xs" />
          <span className=" ">{course.course_code}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-600 mt-2">
          {/* <FaClipboard className="text-xs" /> */}
          <FaUserFriends className="text-xs" />
          <span className=" ">{course.class_name}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed">
          {course.description || 'No description available'}
        </p>
      </CardContent>
    </Card>
  </Link>
);

const EmptyState = ({ userRole }: { userRole?: string }) => {
  const getMessage = () => {
    switch (userRole) {
      case 'STUDENT':
        return 'You are not enrolled in any courses yet. Please contact your administrator for course enrollment.';
      case 'TEACHER':
        return 'You are not assigned to teach any courses yet. Please contact your administrator.';
      case 'ADMIN':
        return 'No courses have been created yet. You can create courses through the admin panel.';
      default:
        return 'There are currently no courses to display. Please check back later or contact your administrator.';
    }
  };

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-12">
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <FaBook className="text-gray-400 text-3xl" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No Courses Available</h3>
      <p className="text-gray-600 text-center max-w-md">{getMessage()}</p>
    </div>
  );
};

const LoadingState = () => (
  <div className="col-span-full flex flex-col items-center justify-center py-12">
    <FaSpinner className="text-blue-500 text-4xl animate-spin mb-4" />
    <p className="text-gray-600">Loading courses...</p>
  </div>
);

// const getPageTitle = (role?: string) => {
//   switch (role) {
//     case 'STUDENT':
//       return 'My Courses';
//     case 'TEACHER':
//       return 'Teaching Courses';
//     case 'ADMIN':
//       return 'All Courses';
//     default:
//       return 'Courses';
//   }
// };

// const getPageDescription = (role?: string) => {
//   switch (role) {
//     case 'STUDENT':
//       return 'View and access your enrolled courses';
//     case 'TEACHER':
//       return 'Manage your teaching courses';
//     case 'ADMIN':
//       return 'Manage all courses in the system';
//     default:
//       return 'Browse and access your available courses';
//   }
// };

const Course = () => {
  const { data: session, status } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      // Wait for session to load
      if (status === 'loading') {
        return;
      }

      if (status === 'unauthenticated' || !session?.user) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setLoading(true);

        // Build API URL with user-specific filters
        let apiUrl = '/api/courses';
        const params = new URLSearchParams(); // Filter courses based on user role
        if (session.user.role === 'STUDENT' && session.user.id) {
          params.append('studentId', session.user.id);
        } else if (session.user.role === 'TEACHER' && session.user.id) {
          params.append('teacherId', session.user.id);
        }
        // For ADMIN role, no filtering - show all courses

        if (params.toString()) {
          apiUrl += `?${params.toString()}`;
        }

        console.log('Fetching courses for user:', {
          role: session.user.role,
          userId: session.user.id,
          apiUrl,
        });

        const res = await fetch(apiUrl);

        if (!res.ok) {
          throw new Error('Failed to fetch courses');
        }

        const data = await res.json();
        setCourses(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [session, status]);

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />

      <div className="flex flex-col flex-1 bg-gray-50">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />{' '}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          {/* Page Header */}
          <div className="mb-8">
            {/* <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FaBook className="text-blue-600 text-xl" />
              </div>{' '}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{getPageTitle(session?.user?.role)}</h1>
                <p className="text-gray-600 mt-1">{getPageDescription(session?.user?.role)}</p>
              </div>
            </div> */}

            {!loading && !error && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mt-4">
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                  {courses.length} {courses.length === 1 ? 'Course' : 'Courses'}
                </span>
                {/* {session?.user?.role && (
                  <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium capitalize">
                    {session.user.role}
                  </span>
                )} */}
              </div>
            )}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-red-800">
                <span className="font-medium">Error:</span>
                <span>{error}</span>
              </div>
            </div>
          )}{' '}
          <div className={cn('grid gap-4 md:gap-6', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3')}>
            {loading ? (
              <LoadingState />
            ) : error ? (
              <div className="col-span-full text-center py-12">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : courses.length === 0 ? (
              <EmptyState userRole={session?.user?.role} />
            ) : (
              // courses.map((course, index) => <CourseCard key={course.id || index} course={course} />)
              // courses.map((course, index) => (
              //   <CourseCard
              //     key={`${course.course_code}-${course.class_name}-${course.grade_level || index}`}
              //     course={course}
              //   />
              // ))
              // courses.map((course, index) => (
              // <CourseCard
              //   key={`${course.course_code}-${course.class_name}-${course.grade_level || index}`}
              //   course={course} />
              // ))
              courses.map((course, index) => (
                <CourseCard
                  key={course.id} // Now this will be unique class_course.id
                  course={course}
                />
              ))
            )}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default Course;
