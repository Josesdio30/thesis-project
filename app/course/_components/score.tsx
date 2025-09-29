import React, { useEffect, useState } from 'react';
import {
  FaTrophy,
  FaCheckCircle,
  FaExclamationCircle,
  FaClock,
  FaEye,
  FaChartBar,
  FaTable,
  FaTh,
} from 'react-icons/fa';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Submission {
  id: number;
  assignment_id: number;
  assignment_title: string;
  assignment_description?: string;
  assignment_total_points: number;
  assignment_due_date?: string;
  assignment_type: string;
  course_code: string;
  course_name: string;
  class_name: string;
  session_title: string;
  session_number: number;
  student?: {
    id: number;
    nama_lengkap: string;
    user_name: string;
  };
  attempt_number: number;
  started_at?: string;
  submitted_at?: string;
  total_score?: number;
  status: string;
  status_id: number;
  feedback?: string;
  graded_by?: number;
  graded_at?: string;
}

interface ScoreTabProps {
  courseCode: string;
  className?: string;
}

export default function ScoreTab({ courseCode, className }: ScoreTabProps) {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'submissions' | 'assignments' | 'table'>('submissions');
  const [selectedStudent, setSelectedStudent] = useState<string>('all');
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [modalStudentData, setModalStudentData] = useState<any>(null);

  // Derived state from session
  const isTeacher = session?.user?.role === 'TEACHER' || session?.user?.role === 'GURU';
  const currentUserId = session?.user?.id ? parseInt(session.user.id) : null;

  useEffect(() => {
    fetchScores();
  }, [courseCode, className]);

  const fetchScores = async () => {
    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams();
      if (courseCode) params.append('course', courseCode);
      if (className) params.append('class', className);

      const response = await fetch(`/api/scores?${params.toString()}`);
      if (!response.ok) {
        console.error('Failed to fetch scores');
        setSubmissions([]);
        return;
      }

      const data = await response.json();
      const fetchedSubmissions = data.data || [];

      // No need for client-side filtering anymore - API handles it
      setSubmissions(fetchedSubmissions);
    } catch (error) {
      console.error('Error fetching scores:', error);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
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

  // Group submissions by assignment
  const groupedByAssignment = submissions.reduce((groups, submission) => {
    const assignmentKey = `${submission.assignment_id}`;
    if (!groups[assignmentKey]) {
      groups[assignmentKey] = {
        assignment_title: submission.assignment_title,
        assignment_total_points: submission.assignment_total_points,
        assignment_type: submission.assignment_type,
        session_title: submission.session_title,
        session_number: submission.session_number,
        submissions: [],
      };
    }
    groups[assignmentKey].submissions.push(submission);
    return groups;
  }, {} as Record<string, any>);

  // Get unique students for filter dropdown
  const uniqueStudents = Array.from(
    new Map(submissions.filter(s => s.student).map(s => [s.student!.id, s.student!])).values()
  );

  // Filter submissions by selected student
  const filteredSubmissions =
    selectedStudent === 'all' ? submissions : submissions.filter(s => s.student?.id.toString() === selectedStudent);

  const handleStudentRowClick = (studentData: any) => {
    setModalStudentData(studentData);
    setShowStudentModal(true);
  };

  const renderSubmissionCard = (submission: Submission) => {
    const status = getScoreStatus(submission);

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-gray-800 truncate">{submission.assignment_title}</h3>
            <p className="text-sm text-gray-600">
              {submission.session_title} • {submission.assignment_type}
            </p>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} flex items-center whitespace-nowrap ml-2`}
          >
            {status.icon}
            {status.text}
          </span>
        </div>

        {/* Score Information */}
        <div className="space-y-3 mb-4">
          {submission.total_score !== null && submission.total_score !== undefined ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Score:</span>
              <span className="text-lg font-bold text-blue-600">
                {submission.total_score}/{submission.assignment_total_points}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Score:</span>
              <span className="text-sm text-orange-600">Pending</span>
            </div>
          )}

          {/* {submission.total_score !== null && submission.total_score !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Percentage:</span>
              <span className="text-sm font-semibold text-gray-800">
                {((submission.total_score / submission.assignment_total_points) * 100).toFixed(1)}%
              </span>
            </div>
          )} */}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Attempt:</span>
            <span className="text-sm text-gray-600">{submission.attempt_number}</span>
          </div>

          {submission.submitted_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Submitted:</span>
              <span className="text-sm text-gray-600">{formatDateTime(submission.submitted_at)}</span>
            </div>
          )}

          {submission.graded_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Graded:</span>
              <span className="text-sm text-gray-600">{formatDateTime(submission.graded_at)}</span>
            </div>
          )}
        </div>

        {/* Student Info (for teachers) */}
        {isTeacher && submission.student && (
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center text-sm text-gray-600">
              <span className="font-medium">Student:</span>
              <span className="ml-2">{submission.student.nama_lengkap}</span>
            </div>
          </div>
        )}

        {/* Feedback */}
        {submission.feedback && (
          <div className="border-t pt-3 mt-3">
            <h5 className="text-sm font-medium text-gray-700 mb-1">Feedback:</h5>
            <p className="text-sm text-gray-600 line-clamp-2">{submission.feedback}</p>
          </div>
        )}
      </div>
    );
  };

  const renderTableView = () => {
    // Group submissions by student first, then by assignment
    const studentGroups: Record<string, { student: any; submissions: Submission[] }> = {};

    submissions.forEach(submission => {
      if (submission.student) {
        const studentKey = submission.student.id.toString();
        if (!studentGroups[studentKey]) {
          studentGroups[studentKey] = {
            student: submission.student,
            submissions: [],
          };
        }
        studentGroups[studentKey].submissions.push(submission);
      }
    });

    // Get unique assignments for table headers
    const assignmentMap: Record<string, { title: string; totalPoints: number }> = {};
    submissions.forEach(submission => {
      const assignmentKey = submission.assignment_id.toString();
      if (!assignmentMap[assignmentKey]) {
        assignmentMap[assignmentKey] = {
          title: submission.assignment_title,
          totalPoints: submission.assignment_total_points,
        };
      }
    });

    const assignments = Object.entries(assignmentMap);

    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            {/* Header */}
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                  Student
                </th>
                {assignments.map(([assignmentId, assignment]) => (
                  <th
                    key={assignmentId}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                  >
                    <div className="truncate" title={assignment.title}>
                      {assignment.title.length > 15 ? `${assignment.title.substring(0, 15)}...` : assignment.title}
                    </div>
                    <div className="text-gray-400 font-normal">/{assignment.totalPoints}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Average
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(studentGroups).map(([studentId, studentData]) => {
                const studentSubmissions = studentData.submissions;
                const gradedSubmissions = studentSubmissions.filter(s => s.total_score !== null);
                const totalEarned = gradedSubmissions.reduce((sum, s) => sum + (s.total_score || 0), 0);
                const totalPossible = gradedSubmissions.reduce((sum, s) => sum + s.assignment_total_points, 0);
                const averagePercentage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;

                return (
                  <tr
                    key={studentId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleStudentRowClick(studentData)}
                  >
                    {/* Student Name */}
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white hover:bg-gray-50 z-10">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{studentData.student.nama_lengkap}</div>
                          <div className="text-sm text-gray-500">{studentData.student.user_name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Assignment Scores */}
                    {assignments.map(([assignmentId, assignment]) => {
                      const submission = studentSubmissions.find(s => s.assignment_id.toString() === assignmentId);

                      if (!submission) {
                        return (
                          <td key={assignmentId} className="px-4 py-4 whitespace-nowrap text-center">
                            <span className="text-gray-400 text-sm">-</span>
                          </td>
                        );
                      }

                      const status = getScoreStatus(submission);

                      return (
                        <td key={assignmentId} className="px-4 py-4 whitespace-nowrap text-center">
                          {submission.total_score !== null && submission.total_score !== undefined ? (
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-gray-900">
                                {submission.total_score}/{submission.assignment_total_points}
                              </div>
                              {/* <div
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                              >
                                {status.icon}
                                {((submission.total_score / submission.assignment_total_points) * 100).toFixed(0)}%
                              </div> */}
                            </div>
                          ) : (
                            <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              <FaClock className="mr-1" />
                              Pending
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Total Score */}
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-gray-900">
                        {totalEarned}/{totalPossible}
                      </div>
                    </td>

                    {/* Average */}
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <div
                        className={`text-sm font-semibold ${
                          averagePercentage >= 80
                            ? 'text-green-600'
                            : averagePercentage >= 70
                            ? 'text-blue-600'
                            : averagePercentage >= 60
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {averagePercentage.toFixed(1)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Row */}
        {Object.keys(studentGroups).length > 0 && (
          <div className="border-t bg-gray-50 px-6 py-3">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-gray-600">Total Students: {Object.keys(studentGroups).length}</span>
              <span className="font-medium text-gray-600">Class Average: {stats.averageScore}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAssignmentCard = (assignmentKey: string, assignmentData: any) => {
    const {
      assignment_title,
      assignment_total_points,
      assignment_type,
      session_title,
      submissions: assignmentSubmissions,
    } = assignmentData;

    const gradedSubmissions = assignmentSubmissions.filter((s: Submission) => s.total_score !== null);
    const averageScore =
      gradedSubmissions.length > 0
        ? gradedSubmissions.reduce((sum: number, s: Submission) => sum + (s.total_score || 0), 0) /
          gradedSubmissions.length
        : 0;

    return (
      <div
        key={assignmentKey}
        className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-gray-800 truncate">{assignment_title}</h3>
            <p className="text-sm text-gray-600">
              {session_title} • {assignment_type}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FaChartBar className="text-blue-600" />
            <span className="text-sm font-medium text-blue-600">
              {assignmentSubmissions.length} submission{assignmentSubmissions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Assignment Stats */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Points:</span>
            <span className="text-sm font-semibold text-gray-800">{assignment_total_points}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Submissions:</span>
            <span className="text-sm text-gray-600">{assignmentSubmissions.length}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Graded:</span>
            <span className="text-sm text-gray-600">{gradedSubmissions.length}</span>
          </div>

          {gradedSubmissions.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Average Score:</span>
              <span className="text-sm font-semibold text-blue-600">
                {averageScore.toFixed(1)}/{assignment_total_points}
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isTeacher && (
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Grading Progress</span>
              <span>
                {gradedSubmissions.length}/{assignmentSubmissions.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    assignmentSubmissions.length > 0
                      ? (gradedSubmissions.length / assignmentSubmissions.length) * 100
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading scores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Scores</h2>
          {/* <p className="text-gray-600">
            {isTeacher ? 'View and manage student submission scores' : 'Track your assignment scores and performance'}
          </p> */}
        </div>

        {/* View Toggle */}
        {submissions.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {isTeacher ? (
                <>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                      viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <FaTable className="text-xs" />
                    Table View
                  </button>
                  <button
                    onClick={() => setViewMode('submissions')}
                    className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                      viewMode === 'submissions'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <FaTh className="text-xs" />
                    Card View
                  </button>
                  <button
                    onClick={() => setViewMode('assignments')}
                    className={`px-3 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
                      viewMode === 'assignments'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <FaChartBar className="text-xs" />
                    By Assignment
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setViewMode('submissions')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      viewMode === 'submissions'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    All Submissions
                  </button>
                  <button
                    onClick={() => setViewMode('assignments')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      viewMode === 'assignments'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    By Assignment
                  </button>
                </>
              )}
            </div>

            {/* Student Filter - Only show for card view and if teacher has students */}
            {isTeacher && viewMode === 'submissions' && uniqueStudents.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600">Filter by Student:</label>
                <select
                  value={selectedStudent}
                  onChange={e => setSelectedStudent(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Students ({submissions.length})</option>
                  {uniqueStudents.map(student => (
                    <option key={student.id} value={student.id.toString()}>
                      {student.nama_lengkap} ({submissions.filter(s => s.student?.id === student.id).length})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {submissions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {isTeacher ? (
            <>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaEye className="text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Submissions</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalSubmissions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaCheckCircle className="text-green-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Graded</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.gradedSubmissions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaClock className="text-orange-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.pendingGrading}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaChartBar className="text-purple-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Average Score</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.averageScore}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaEye className="text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Submissions</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalSubmissions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaCheckCircle className="text-green-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Graded</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.gradedSubmissions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaClock className="text-orange-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.pendingScores}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center">
                  <FaTrophy className="text-yellow-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Overall</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.overallPercentage}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No scores found</h3>
          <p className="text-gray-500">
            {isTeacher
              ? 'No student submissions have been made for this course yet.'
              : "You haven't submitted any assignments for this course yet."}
          </p>
        </div>
      ) : viewMode === 'table' && isTeacher ? (
        renderTableView()
      ) : viewMode === 'submissions' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSubmissions.map(submission => (
            <div key={`${submission.course_code}-${submission.id}`}>{renderSubmissionCard(submission)}</div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(groupedByAssignment).map(([assignmentKey, assignmentData]) =>
            renderAssignmentCard(assignmentKey, assignmentData)
          )}
        </div>
      )}

      {/* Student Detail Modal */}
      <Dialog open={showStudentModal} onOpenChange={setShowStudentModal}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaEye className="text-blue-600" />
              {modalStudentData?.student.nama_lengkap}
            </DialogTitle>
            <DialogDescription>
              Student performance overview for {modalStudentData?.student.user_name}
            </DialogDescription>
          </DialogHeader>

          {modalStudentData && (
            <div className="space-y-6">
              {/* Student Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{modalStudentData.submissions.length}</p>
                  <p className="text-sm text-blue-700">Total Submissions</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {modalStudentData.submissions.filter((s: Submission) => s.total_score !== null).length}
                  </p>
                  <p className="text-sm text-green-700">Graded</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {modalStudentData.submissions.filter((s: Submission) => s.total_score === null).length}
                  </p>
                  <p className="text-sm text-orange-700">Pending</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {(() => {
                      const gradedSubmissions = modalStudentData.submissions.filter(
                        (s: Submission) => s.total_score !== null
                      );
                      const totalEarned = gradedSubmissions.reduce(
                        (sum: number, s: Submission) => sum + (s.total_score || 0),
                        0
                      );
                      const totalPossible = gradedSubmissions.reduce(
                        (sum: number, s: Submission) => sum + s.assignment_total_points,
                        0
                      );
                      return totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : '0.0';
                    })()}
                    %
                  </p>
                  <p className="text-sm text-purple-700">Average</p>
                </div>
              </div>

              {/* Submissions List */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">All Submissions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {modalStudentData.submissions.map((submission: Submission) => (
                    <div key={submission.id}>{renderSubmissionCard(submission)}</div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setShowStudentModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
