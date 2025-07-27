// 'use client';

// import Sidebar from '../_components/sidebar';
// import Link from 'next/link';
// import { useState } from 'react';

// export default function AssignmentPage() {
//   const [isMobileOpen, setIsMobileOpen] = useState(false);

//   return (
//     <div className="flex min-h-screen bg-gray-100">
//       <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
//       <div className="flex-1 p-6">
//         <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
//           <Link
//             href="/dashboard"
//             className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
//           >
//             ⬅
//           </Link>
//           <h1 className="text-2xl font-bold">Assignment</h1>
//           <div></div>
//         </div>

//         <div className="bg-white p-6 rounded-md shadow">
//           <p className="text-gray-600">Assignment page - Coming soon</p>
//         </div>
//       </div>
//     </div>
//   );
// }

// new

'use client';

import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';
import Footer from '@/components/common/footer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FaEye,
  FaClock,
  FaUser,
  FaBook,
  FaBookOpen,
  FaSpinner,
  FaCheckCircle,
  FaExclamationCircle,
  FaTimesCircle,
  FaClipboard,
  FaUserFriends,
} from 'react-icons/fa';

interface Assignment {
  id: number;
  title: string;
  description?: string;
  total_points: number;
  due_date?: string;
  is_published: boolean;
  assignment_type: string;
  course_name: string;
  course_code: string;
  class_name: string;
  session_id: number;
  session_title?: string;
  submissions?: Array<{
    id: number;
    student_id: number;
    submitted_at?: string;
    total_score?: number;
    status_id: number;
  }>;
  questions?: any[];
}

interface CourseAssignment {
  course_code: string;
  course_name: string;
  class_name: string;
  course_description?: string;
  assignments: Assignment[];
  totalAssignments: number;
  publishedAssignments: number;
  submittedAssignments: number;
  overdueAssignments: number;
}

export default function AssignmentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<CourseAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'assignments' | 'courses'>('assignments');

  // Derived state from session
  const isTeacher = session?.user?.role === 'TEACHER' || session?.user?.role === 'GURU';
  const currentUserId = session?.user?.id ? parseInt(session.user.id) : null;

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' || !session?.user) {
      setLoading(false);
      return;
    }

    fetchAllAssignments();
  }, [session, status]);

  const fetchAllAssignments = async () => {
    try {
      setLoading(true);

      // Get courses for the user based on their role
      const queryParam = isTeacher ? `teacherId=${currentUserId}` : `studentId=${currentUserId}`;
      console.log('Fetching courses with:', queryParam, { isTeacher, currentUserId });

      const coursesResponse = await fetch(`/api/courses?${queryParam}`);
      if (!coursesResponse.ok) {
        throw new Error('Failed to fetch courses');
      }

      const coursesData = await coursesResponse.json();
      console.log('Courses response:', coursesData);
      const courses = coursesData.data || [];

      const allAssignments: Assignment[] = [];
      const courseAssignmentGroups: CourseAssignment[] = [];

      // Fetch assignments for each course using the new efficient endpoint
      for (const course of courses) {
        console.log('Processing course:', course);

        // Handle different data structures for teachers vs students
        let courseCode, courseName, className, courseDescription;

        if (isTeacher) {
          // Teacher structure: direct properties from class_courses response
          courseCode = course.course_code;
          courseName = course.course_name;
          className = course.class_name;
          courseDescription = course.description;
        } else {
          // Student structure: direct properties from enrollment
          courseCode = course.course_code;
          courseName = course.course_name;
          className = course.class_name;
          courseDescription = course.description;
        }

        if (!courseCode) continue;

        try {
          // Use the new single API call for all assignments in a course
          console.log('Fetching assignments for course:', courseCode);
          const assignmentsResponse = await fetch(`/api/courses/${courseCode}/assignments`);

          if (assignmentsResponse.ok) {
            const assignmentsData = await assignmentsResponse.json();
            console.log('Assignments response for', courseCode, ':', assignmentsData);
            const courseAssignments = (assignmentsData.data || []).map((assignment: any) => ({
              ...assignment,
              course_name: courseName,
              course_code: courseCode,
              class_name: className,
            }));

            allAssignments.push(...courseAssignments);

            if (courseAssignments.length > 0) {
              const published = courseAssignments.filter((a: Assignment) => a.is_published);
              const submitted = isTeacher
                ? 0
                : courseAssignments.filter((a: Assignment) => getUserSubmission(a)).length;
              const overdue = isTeacher
                ? 0
                : courseAssignments.filter((a: Assignment) => isOverdue(a.due_date) && !getUserSubmission(a)).length;

              courseAssignmentGroups.push({
                course_code: courseCode,
                course_name: courseName,
                class_name: className,
                course_description: courseDescription,
                assignments: courseAssignments,
                totalAssignments: courseAssignments.length,
                publishedAssignments: published.length,
                submittedAssignments: submitted,
                overdueAssignments: overdue,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching assignments for course ${courseCode}:`, error);
        }
      }

      console.log('Final assignments:', allAssignments);
      console.log('Final course assignment groups:', courseAssignmentGroups);

      setAssignments(allAssignments);
      setCourseAssignments(courseAssignmentGroups);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      setAssignments([]);
      setCourseAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentClick = (assignment: Assignment) => {
    router.push(`/course/${assignment.course_code}?sessionId=${assignment.session_id}&tab=Assignment`);
  };

  const handleCourseClick = (courseCode: string) => {
    router.push(`/course/${courseCode}?tab=Assignment`);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const getUserSubmission = (assignment: Assignment) => {
    if (!currentUserId || !assignment.submissions) return null;
    return assignment.submissions.find(sub => sub.student_id === currentUserId);
  };

  const getAssignmentStatus = (assignment: Assignment) => {
    if (!assignment.is_published) {
      return {
        text: 'Draft',
        color: 'text-gray-600',
        bg: 'bg-gray-100',
        icon: <FaTimesCircle className="text-gray-500 mr-1" />,
      };
    }

    if (!isTeacher) {
      const userSubmission = getUserSubmission(assignment);
      if (userSubmission) {
        if (userSubmission.total_score !== null) {
          return {
            text: 'Graded',
            color: 'text-green-700',
            bg: 'bg-green-100',
            icon: <FaCheckCircle className="text-green-600 mr-1" />,
          };
        }
        return {
          text: 'Submitted',
          color: 'text-blue-700',
          bg: 'bg-blue-100',
          icon: <FaCheckCircle className="text-blue-600 mr-1" />,
        };
      }

      if (isOverdue(assignment.due_date)) {
        return {
          text: 'Overdue',
          color: 'text-red-700',
          bg: 'bg-red-100',
          icon: <FaExclamationCircle className="text-red-600 mr-1" />,
        };
      }
    }

    return {
      text: 'Available',
      color: 'text-green-700',
      bg: 'bg-green-100',
      icon: <FaCheckCircle className="text-green-600 mr-1" />,
    };
  };

  const getStats = () => {
    if (isTeacher) {
      return {
        total: assignments.length,
        published: assignments.filter(a => a.is_published).length,
        draft: assignments.filter(a => !a.is_published).length,
      };
    } else {
      const available = assignments.filter(a => a.is_published);
      const submitted = available.filter(a => getUserSubmission(a));
      const overdue = available.filter(a => isOverdue(a.due_date) && !getUserSubmission(a));

      return {
        total: available.length,
        submitted: submitted.length,
        pending: available.length - submitted.length - overdue.length,
        overdue: overdue.length,
      };
    }
  };

  const stats = getStats();

  if (status === 'loading') {
    return (
      // <div className="flex min-h-screen bg-gray-100">
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FaSpinner className="animate-spin text-4xl text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session?.user) {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
              <p className="text-gray-600">Please log in to view assignments.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FaSpinner className="animate-spin text-4xl text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading assignments...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex-1 overflow-y-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Assignments</h1>
                <p className="text-gray-600">
                  {isTeacher ? 'Manage your assignments' : 'View and complete your assignments'}
                </p>
              </div>

              <Link
                href="/dashboard"
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                ← Back to Dashboard
              </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {isTeacher ? (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                      <div className="text-sm text-gray-600">Total Assignments</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-600">{stats.published}</div>
                      <div className="text-sm text-gray-600">Published</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
                      <div className="text-sm text-gray-600">Draft</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-purple-600">{courseAssignments.length}</div>
                      <div className="text-sm text-gray-600">Courses</div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                      <div className="text-sm text-gray-600">Total Available</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-600">{stats.submitted}</div>
                      <div className="text-sm text-gray-600">Submitted</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                      {/* <div className="text-sm text-gray-600">Pending</div> */}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
                      <div className="text-sm text-gray-600">Overdue</div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setViewMode('assignments')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'assignments'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                }`}
              >
                All Assignments
              </button>
              <button
                onClick={() => setViewMode('courses')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'courses' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border'
                }`}
              >
                By Course
              </button>
            </div>
          </div>

          {/* Content */}
          {assignments.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No assignments found</h3>
              <p className="text-gray-500">
                {isTeacher
                  ? 'Start by creating assignments in your course sessions.'
                  : 'No assignments have been created yet.'}
              </p>
            </div>
          ) : viewMode === 'assignments' ? (
            // All Assignments View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assignments.map(assignment => {
                const status = getAssignmentStatus(assignment);
                const userSubmission = getUserSubmission(assignment);

                return (
                  <div
                    key={`${assignment.course_code}-${assignment.class_name}-${assignment.id}`}
                    onClick={() => handleAssignmentClick(assignment)}
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-lg text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-2">
                        {assignment.title}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} flex items-center whitespace-nowrap ml-2`}
                      >
                        {status.icon}
                        {status.text}
                      </span>
                    </div>

                    {/* Course Info */}
                    <div className="mb-3 p-2 bg-gray-50 rounded">
                      <div className="flex items-center text-sm text-gray-700 mb-1">
                        <FaBookOpen className="mr-2 text-xs" />
                        <span className="font-medium">{assignment.course_name}</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {assignment.course_code} • {assignment.class_name}
                      </div>
                      {assignment.session_title && (
                        <div className="text-xs text-gray-600 mt-1">Session: {assignment.session_title}</div>
                      )}
                    </div>

                    {/* Description */}
                    {assignment.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{assignment.description}</p>
                    )}

                    {/* Assignment Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <FaUser className="mr-2 text-xs" />
                        <span>Type: {assignment.assignment_type}</span>
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <span className="mr-2">🎯</span>
                        <span>{assignment.total_points} points</span>
                      </div>

                      {assignment.due_date && (
                        <div
                          className={`flex items-center text-sm ${
                            isOverdue(assignment.due_date) ? 'text-red-600' : 'text-gray-600'
                          }`}
                        >
                          <FaClock className="mr-2 text-xs" />
                          <span>Due: {formatDateTime(assignment.due_date)}</span>
                        </div>
                      )}

                      {assignment.questions && (
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="mr-2">❓</span>
                          <span>
                            {assignment.questions.length} question{assignment.questions.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* User Submission Info */}
                    {!isTeacher && userSubmission && (
                      <div className="border-t pt-3 mt-3">
                        <div className="text-sm text-gray-600">
                          {userSubmission.submitted_at && (
                            <p>Submitted: {formatDateTime(userSubmission.submitted_at)}</p>
                          )}
                          {userSubmission.total_score !== null && (
                            <p className="font-medium text-blue-600">
                              Score: {userSubmission.total_score}/{assignment.total_points}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Teacher Stats */}
                    {isTeacher && assignment.submissions && (
                      <div className="border-t pt-3 mt-3">
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Submissions: {assignment.submissions.length}</span>
                          <span>Graded: {assignment.submissions.filter(s => s.total_score !== null).length}</span>
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t">
                      <button className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                        <FaEye />
                        {isTeacher ? 'View & Manage' : 'View Assignment'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // By Course View - Card Layout
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {courseAssignments.map(courseGroup => (
                <Card
                  key={`${courseGroup.course_code}-${courseGroup.class_name}`}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg font-semibold text-gray-800">{courseGroup.course_code}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">{courseGroup.course_name}</p>
                        {courseGroup.class_name && (
                          <Badge variant="outline" className="mt-2">
                            {courseGroup.class_name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">{courseGroup.totalAssignments} assignments</Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{courseGroup.publishedAssignments}</p>
                        <p className="text-xs text-gray-500">Published</p>
                      </div>
                      {!isTeacher && (
                        <>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{courseGroup.submittedAssignments}</p>
                            <p className="text-xs text-gray-500">Submitted</p>
                          </div>
                        </>
                      )}
                      {!isTeacher && courseGroup.overdueAssignments > 0 && (
                        <div className="text-center col-span-2">
                          <p className="text-2xl font-bold text-red-600">{courseGroup.overdueAssignments}</p>
                          <p className="text-xs text-gray-500">Overdue</p>
                        </div>
                      )}
                    </div>

                    {courseGroup.course_description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{courseGroup.course_description}</p>
                    )}

                    {/* Recent Assignments */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Recent Assignments</h4>
                      {courseGroup.assignments.slice(0, 3).map(assignment => {
                        const userSubmission = getUserSubmission(assignment);
                        const isOverdueAssignment = isOverdue(assignment.due_date);

                        return (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => handleAssignmentClick(assignment)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{assignment.title}</p>
                              <p className="text-xs text-gray-500">
                                Due:{' '}
                                {assignment.due_date
                                  ? new Date(assignment.due_date).toLocaleDateString()
                                  : 'No due date'}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              {!isTeacher && (
                                <Badge
                                  variant={
                                    userSubmission ? 'default' : isOverdueAssignment ? 'destructive' : 'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {userSubmission ? 'Submitted' : isOverdueAssignment ? 'Overdue' : 'Pending'}
                                </Badge>
                              )}
                              {!assignment.is_published && (
                                <Badge variant="outline" className="text-xs">
                                  Draft
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {courseGroup.assignments.length > 3 && (
                        <p className="text-xs text-gray-500 text-center">
                          +{courseGroup.assignments.length - 3} more assignments
                        </p>
                      )}
                    </div>

                    {/* View Course Button */}
                    <div className="mt-4 pt-3 border-t">
                      <button
                        onClick={() => handleCourseClick(courseGroup.course_code)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                      >
                        <FaEye />
                        View Course
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
