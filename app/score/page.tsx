'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  groupSubmissionsByCourse,
  type CourseScore,
  type ScoreSubmission,
} from '@/lib/score-view-utils';
import {
  FaSpinner,
  FaClock,
  FaCheckCircle,
  FaExclamationCircle,
  FaTrophy,
  FaEye,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';

type Submission = ScoreSubmission;
const ASSIGNMENT_PREVIEW_LIMIT = 3;

export default function ScorePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'submissions' | 'courses'>('submissions');
  const [expandedAssignmentLists, setExpandedAssignmentLists] = useState<Record<string, boolean>>({});

  // Filters for the submissions data table
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'graded' | 'pending'>('all');

  // Derived state from session
  const isTeacher = session?.user?.role === 'TEACHER' || session?.user?.role === 'GURU';

  // Build unique filter options from the loaded submissions.
  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    submissions.forEach(s => {
      if (!seen.has(s.course_code)) seen.set(s.course_code, `${s.course_code} — ${s.course_name}`);
    });
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [submissions]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (courseFilter === 'all' || s.course_code === courseFilter) set.add(s.class_name);
    });
    return Array.from(set).sort();
  }, [submissions, courseFilter]);

  const assignmentOptions = useMemo(() => {
    const seen = new Map<number, string>();
    submissions.forEach(s => {
      const matchesCourse = courseFilter === 'all' || s.course_code === courseFilter;
      const matchesClass = classFilter === 'all' || s.class_name === classFilter;
      if (matchesCourse && matchesClass && !seen.has(s.assignment_id)) {
        seen.set(s.assignment_id, s.assignment_title);
      }
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [submissions, courseFilter, classFilter]);

  // Apply filters. API already returns newest-first; preserve that order.
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return submissions.filter(s => {
      if (courseFilter !== 'all' && s.course_code !== courseFilter) return false;
      if (classFilter !== 'all' && s.class_name !== classFilter) return false;
      if (assignmentFilter !== 'all' && String(s.assignment_id) !== assignmentFilter) return false;
      if (statusFilter === 'graded' && (s.total_score === null || s.total_score === undefined)) return false;
      if (statusFilter === 'pending' && s.total_score !== null && s.total_score !== undefined) return false;
      if (q) {
        const haystack = [
          s.assignment_title,
          s.course_code,
          s.course_name,
          s.class_name,
          s.session_title,
          s.student?.nama_lengkap,
          s.student?.user_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, searchQuery, courseFilter, classFilter, assignmentFilter, statusFilter]);

  const courseScores = useMemo<CourseScore[]>(
    () => groupSubmissionsByCourse(filteredSubmissions),
    [filteredSubmissions]
  );

  const hasActiveFilters =
    Boolean(searchQuery) ||
    courseFilter !== 'all' ||
    classFilter !== 'all' ||
    assignmentFilter !== 'all' ||
    statusFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setCourseFilter('all');
    setClassFilter('all');
    setAssignmentFilter('all');
    setStatusFilter('all');
  };

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' || !session?.user) {
      setLoading(false);
      return;
    }

    fetchScores();
  }, [session, status]);

  const fetchScores = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/scores');
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to fetch scores: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Fetched scores data:', data);
      const fetchedSubmissions = data.data || [];

      setSubmissions(fetchedSubmissions);
    } catch (error) {
      console.error('Error fetching scores:', error);
      setSubmissions([]);
      alert(`Error loading scores: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmissionClick = (submission: Submission) => {
    const params = new URLSearchParams({ tab: 'Assignment' });
    if (submission.session_id !== null && submission.session_id !== undefined) {
      params.set('sessionId', String(submission.session_id));
    }
    if (submission.class_id !== null && submission.class_id !== undefined) {
      params.set('classId', String(submission.class_id));
    }
    router.push(`/course/${submission.course_code}?${params.toString()}`);
  };

  const handleCourseClick = (courseCode: string) => {
    router.push(`/course/${courseCode}?tab=Scoring`);
  };

  const handleAssignmentClick = (courseCode: string, assignmentId: number) => {
    router.push(`/course/${courseCode}?tab=Assignment&assignmentId=${assignmentId}`);
  };

  const toggleAssignmentList = (courseKey: string) => {
    setExpandedAssignmentLists(current => ({
      ...current,
      [courseKey]: !current[courseKey],
    }));
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

  const getScoreStatus = (submission: Submission) => {
    if (submission.total_score === null || submission.total_score === undefined) {
      return {
        text: 'Pending',
        color: 'text-orange-700',
        bg: 'bg-orange-100',
        icon: <FaClock className="text-orange-600 mr-1" />,
      };
    }

    const percentage = (submission.total_score / submission.assignment_total_points) * 100;

    if (percentage >= 80) {
      return {
        text: 'Excellent',
        color: 'text-green-700',
        bg: 'bg-green-100',
        icon: <FaTrophy className="text-green-600 mr-1" />,
      };
    } else if (percentage >= 70) {
      return {
        text: 'Good',
        color: 'text-blue-700',
        bg: 'bg-blue-100',
        icon: <FaCheckCircle className="text-blue-600 mr-1" />,
      };
    } else if (percentage >= 60) {
      return {
        text: 'Fair',
        color: 'text-yellow-700',
        bg: 'bg-yellow-100',
        icon: <FaExclamationCircle className="text-yellow-600 mr-1" />,
      };
    } else {
      return {
        text: 'Poor',
        color: 'text-red-700',
        bg: 'bg-red-100',
        icon: <FaExclamationCircle className="text-red-600 mr-1" />,
      };
    }
  };

  const getStats = () => {
    if (isTeacher) {
      const gradedCount = submissions.filter(s => s.total_score !== null).length;
      const averageScore =
        gradedCount > 0
          ? submissions.filter(s => s.total_score !== null).reduce((sum, s) => sum + (s.total_score || 0), 0) /
            gradedCount
          : 0;

      return {
        totalSubmissions: submissions.length,
        gradedSubmissions: gradedCount,
        pendingGrading: submissions.length - gradedCount,
        averageScore: averageScore.toFixed(1),
      };
    } else {
      const gradedCount = submissions.filter(s => s.total_score !== null).length;
      const totalPossiblePoints = submissions.reduce((sum, s) => sum + s.assignment_total_points, 0);
      const earnedPoints = submissions
        .filter(s => s.total_score !== null)
        .reduce((sum, s) => sum + (s.total_score || 0), 0);

      return {
        totalSubmissions: submissions.length,
        gradedSubmissions: gradedCount,
        pendingScores: submissions.length - gradedCount,
        overallPercentage: totalPossiblePoints > 0 ? ((earnedPoints / totalPossiblePoints) * 100).toFixed(1) : '0.0',
      };
    }
  };

  const stats = getStats();

  if (status === 'loading') {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />

        <div className="flex flex-col flex-1 bg-gray-50">
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

        <div className="flex flex-col flex-1 bg-gray-50">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
              <p className="text-gray-600">Please log in to view scores.</p>
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

        <div className="flex flex-col flex-1 bg-gray-50">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FaSpinner className="animate-spin text-4xl text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading scores...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />

      <div className="flex flex-col flex-1 bg-gray-50">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Scores</h1>
                {/* <p className="text-gray-600">
                  {isTeacher
                    ? 'View and manage student submission scores'
                    : 'Track your assignment scores and performance'}
                </p> */}
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
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.totalSubmissions}</p>
                      <p className="text-xs text-gray-500">Total Submissions</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{stats.gradedSubmissions}</p>
                      <p className="text-xs text-gray-500">Graded</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-orange-600">{stats.pendingGrading}</p>
                      <p className="text-xs text-gray-500">Pending Grading</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-purple-600">{stats.averageScore}</p>
                      <p className="text-xs text-gray-500">Average Score</p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.totalSubmissions}</p>
                      <p className="text-xs text-gray-500">Submissions</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{stats.gradedSubmissions}</p>
                      <p className="text-xs text-gray-500">Graded</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-orange-600">{stats.pendingScores}</p>
                      <p className="text-xs text-gray-500">Pending</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-purple-600">{stats.overallPercentage}%</p>
                      <p className="text-xs text-gray-500">Overall</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setViewMode('submissions')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'submissions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                }`}
              >
                All Submissions
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
          {submissions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No scores found</h3>
              <p className="text-gray-500">
                {isTeacher
                  ? 'No student submissions have been made yet.'
                  : "You haven't submitted any assignments yet."}
              </p>
            </div>
          ) : viewMode === 'submissions' ? (
            // All Submissions — data table with filters
            <div className="bg-white border border-gray-200 rounded-lg">
              {/* Filter Bar */}
              <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <Input
                    placeholder="Search assignment, student, course…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>

                <Select
                  value={courseFilter}
                  onValueChange={v => {
                    setCourseFilter(v);
                    setClassFilter('all');
                    setAssignmentFilter('all');
                  }}
                >
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue placeholder="Course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Courses</SelectItem>
                    {courseOptions.map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={classFilter}
                  onValueChange={v => {
                    setClassFilter(v);
                    setAssignmentFilter('all');
                  }}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classOptions.map(c => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignments</SelectItem>
                    {assignmentOptions.map(([id, title]) => (
                      <SelectItem key={id} value={String(id)}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger className="h-9 w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="graded">Graded</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
                <span>
                  Showing <span className="font-medium text-gray-800">{filteredSubmissions.length}</span> of{' '}
                  {submissions.length} submissions
                </span>
                {hasActiveFilters && (
                  <button onClick={resetFilters} className="text-blue-600 hover:underline text-xs">
                    Reset filters
                  </button>
                )}
              </div>

              {filteredSubmissions.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No submissions match the current filters.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Course / Class</TableHead>
                      {isTeacher && <TableHead>Student</TableHead>}
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map(submission => {
                      const status = getScoreStatus(submission);
                      const hasScore =
                        submission.total_score !== null && submission.total_score !== undefined;
                      return (
                        <TableRow
                          key={`${submission.course_code}-${submission.id}`}
                          onClick={() => handleSubmissionClick(submission)}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-medium text-gray-800 max-w-xs">
                            <div className="truncate" title={submission.assignment_title}>
                              {submission.assignment_title}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {submission.session_title} • {submission.assignment_type}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-700">{submission.course_code}</div>
                            <div className="text-xs text-gray-500">{submission.class_name}</div>
                          </TableCell>
                          {isTeacher && (
                            <TableCell>
                              {submission.student ? (
                                <>
                                  <div className="text-sm text-gray-700 truncate max-w-[180px]">
                                    {submission.student.nama_lengkap}
                                  </div>
                                  <div className="text-xs text-gray-500">{submission.student.user_name}</div>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-medium">
                            {hasScore
                              ? `${submission.total_score}/${submission.assignment_total_points}`
                              : (
                                <span className="text-gray-400 font-normal">—</span>
                              )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                            >
                              {status.icon}
                              {status.text}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {submission.submitted_at ? formatDateTime(submission.submitted_at) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            // By Course View
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {courseScores.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 text-center py-12 text-gray-500 text-sm">
                  No courses match the current filters.
                  {hasActiveFilters && (
                    <button onClick={resetFilters} className="ml-2 text-blue-600 hover:underline text-xs">
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                courseScores.map(courseScore => {
                  const courseKey = `${courseScore.course_code}-${courseScore.class_name}`;
                  const isAssignmentListExpanded = Boolean(expandedAssignmentLists[courseKey]);
                  const visibleAssignments = isAssignmentListExpanded
                    ? courseScore.assignments
                    : courseScore.assignments.slice(0, ASSIGNMENT_PREVIEW_LIMIT);
                  const hiddenAssignmentCount = Math.max(
                    courseScore.assignments.length - ASSIGNMENT_PREVIEW_LIMIT,
                    0
                  );

                  return (
                    <Card
                      key={courseKey}
                      className="h-[520px] hover:shadow-lg transition-shadow flex flex-col"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-lg font-semibold text-gray-800">
                              {courseScore.course_code}
                            </CardTitle>
                            <p className="text-sm text-gray-600 mt-1 truncate" title={courseScore.course_name}>
                              {courseScore.course_name}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="outline">{courseScore.class_name}</Badge>
                              <Badge variant="secondary">{courseScore.assignments.length} assignments</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{courseScore.totalSubmissions} submissions</Badge>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="flex flex-1 min-h-0 flex-col">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{courseScore.gradedSubmissions}</p>
                            <p className="text-xs text-gray-500">Graded</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">
                              {courseScore.averageScore > 0 ? courseScore.averageScore.toFixed(1) : '0.0'}
                            </p>
                            <p className="text-xs text-gray-500">Avg Score</p>
                          </div>
                          {!isTeacher && (
                            <div className="text-center col-span-2">
                              <p className="text-2xl font-bold text-purple-600">
                                {courseScore.totalPossiblePoints > 0
                                  ? ((courseScore.earnedPoints / courseScore.totalPossiblePoints) * 100).toFixed(1)
                                  : '0.0'}
                                %
                              </p>
                              <p className="text-xs text-gray-500">Overall Percentage</p>
                            </div>
                          )}
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-medium text-gray-700">Assignments</h4>
                              <p className="text-xs text-gray-500">
                                {isAssignmentListExpanded
                                  ? `Showing all ${courseScore.assignments.length}`
                                  : `Latest ${visibleAssignments.length} of ${courseScore.assignments.length}`}
                              </p>
                            </div>
                            {hiddenAssignmentCount > 0 && (
                              <button
                                type="button"
                                aria-expanded={isAssignmentListExpanded}
                                onClick={() => toggleAssignmentList(courseKey)}
                                className="shrink-0 text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                {isAssignmentListExpanded ? (
                                  <>
                                    <FaChevronUp />
                                    Show latest
                                  </>
                                ) : (
                                  <>
                                    <FaChevronDown />
                                    Show all {courseScore.assignments.length}
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          <div className="min-h-0 flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                            {visibleAssignments.map(assignment => {
                              const completionPct =
                                assignment.totalSubmissions > 0
                                  ? (assignment.gradedSubmissions / assignment.totalSubmissions) * 100
                                  : 0;
                              return (
                                <button
                                  type="button"
                                  key={assignment.assignment_id}
                                  className="w-full text-left p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                                  onClick={() => handleAssignmentClick(courseScore.course_code, assignment.assignment_id)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-800 truncate">
                                        {assignment.assignment_title}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {assignment.assignment_type} • {assignment.gradedSubmissions}/
                                        {assignment.totalSubmissions} graded
                                      </p>
                                    </div>
                                    <Badge
                                      variant={assignment.gradedSubmissions > 0 ? 'default' : 'secondary'}
                                      className="text-xs whitespace-nowrap"
                                    >
                                      {assignment.gradedSubmissions > 0
                                        ? `${assignment.averageScore.toFixed(1)}/${assignment.assignment_total_points}`
                                        : 'Pending'}
                                    </Badge>
                                  </div>
                                  <div className="mt-2">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                      <span>Progress</span>
                                      <span>{completionPct.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className="bg-green-500 h-1.5 rounded-full transition-all"
                                        style={{ width: `${completionPct}%` }}
                                      />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* View Course Button */}
                        <div className="mt-4 pt-3 border-t">
                          <button
                            onClick={() => handleCourseClick(courseScore.course_code)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                          >
                            <FaEye />
                            View Course
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
