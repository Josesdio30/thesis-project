import React, { useEffect, useState } from 'react';
import AssignmentCreateModal from './assignment-create-modal';
import AssignmentDetailModal from './assignment-detail-modal';
import { FaPlus, FaEye, FaClock, FaUser, FaEdit, FaGlobe, FaEyeSlash } from 'react-icons/fa';
import { useSession } from 'next-auth/react';

interface Assignment {
  id: number;
  title: string;
  description?: string;
  instructions?: string;
  total_points: number;
  due_date?: string;
  time_limit?: number;
  attempts_allowed: number;
  show_results: boolean;
  is_published: boolean;
  assignment_type_id: number;
  assignment_type: string;
  created_date: string;
  questions?: any[];
  submissions?: any[];
  session_id?: number;
  session_title?: string;
  session_number?: number;
}

interface AssignmentTabProps {
  courseCode: string;
  sessionId: number;
}

export default function AssignmentTab({ courseCode, sessionId }: AssignmentTabProps) {
  const { data: session } = useSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'by-session'>('all');

  // Derived state from session
  const isTeacher = session?.user?.role === 'TEACHER' || session?.user?.role === 'GURU';
  const currentUserId = session?.user?.id ? parseInt(session.user.id) : null;

  useEffect(() => {
    fetchAssignments();
  }, [courseCode, sessionId]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);

      // Fetch all assignments for this course in one API call
      const response = await fetch(`/api/courses/${courseCode}/assignments`);
      if (!response.ok) {
        console.error('Failed to fetch assignments');
        setAssignments([]);
        return;
      }

      const data = await response.json();
      setAssignments(data.data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentClick = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleEditClick = (assignment: Assignment, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the detail modal
    setSelectedAssignment(assignment);
    setShowEditModal(true);
  };

  const handleCreateSuccess = () => {
    fetchAssignments(); // Refresh the list
  };

  const handleEditSuccess = () => {
    fetchAssignments(); // Refresh the list
    setShowEditModal(false);
    setSelectedAssignment(null);
  };

  const handlePublishToggle = async (assignment: Assignment, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the detail modal

    try {
      const response = await fetch(
        `/api/courses/${courseCode}/sessions/${assignment.session_id}/assignments/${assignment.id}/publish`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_published: !assignment.is_published,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update assignment status');
      }

      // Refresh assignments to show updated status
      await fetchAssignments();
    } catch (error) {
      console.error('Error updating assignment status:', error);
      alert(
        `Failed to ${assignment.is_published ? 'unpublish' : 'publish'} assignment: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  };

  const handleBulkPublish = async (publish: boolean) => {
    const targetAssignments = assignments.filter(a => a.is_published !== publish);

    if (targetAssignments.length === 0) {
      alert(`All assignments are already ${publish ? 'published' : 'unpublished'}.`);
      return;
    }

    const confirmMessage = `Are you sure you want to ${publish ? 'publish' : 'unpublish'} ${
      targetAssignments.length
    } assignment${targetAssignments.length !== 1 ? 's' : ''}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const promises = targetAssignments.map(assignment =>
        fetch(`/api/courses/${courseCode}/sessions/${assignment.session_id}/assignments/${assignment.id}/publish`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_published: publish,
          }),
        })
      );

      const results = await Promise.allSettled(promises);
      const failed = results.filter(result => result.status === 'rejected').length;

      if (failed > 0) {
        alert(
          `${targetAssignments.length - failed} assignments ${
            publish ? 'published' : 'unpublished'
          } successfully. ${failed} failed.`
        );
      } else {
        alert(`All ${targetAssignments.length} assignments ${publish ? 'published' : 'unpublished'} successfully.`);
      }

      // Refresh assignments
      await fetchAssignments();
    } catch (error) {
      console.error('Error bulk updating assignments:', error);
      alert('Failed to update assignments. Please try again.');
    }
  };

  const handleSubmitAnswer = async (answers: any[]) => {
    if (!selectedAssignment || !currentUserId) return;

    try {
      // Transform answers to match API format
      const formattedAnswers = answers
        .map((answer, index) => {
          const question = selectedAssignment.questions?.[index];
          if (!question) return null;

          return {
            question_id: question.id,
            answer_text: typeof answer === 'string' ? answer : null,
            selected_option_id:
              typeof answer === 'object' && answer.selected_option_id ? answer.selected_option_id : null,
          };
        })
        .filter(Boolean);

      const response = await fetch(
        `/api/courses/${courseCode}/sessions/${selectedAssignment.session_id}/assignments/${selectedAssignment.id}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: currentUserId,
            answers: formattedAnswers,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit assignment');
      }

      // Refresh assignments to get updated submission data
      await fetchAssignments();
    } catch (error) {
      console.error('Error submitting assignment:', error);
      throw error;
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

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const getUserSubmission = (assignment: Assignment) => {
    if (!currentUserId || !assignment.submissions) return null;
    return assignment.submissions.find(sub => sub.student.id === currentUserId);
  };

  const getAssignmentStatus = (assignment: Assignment) => {
    if (!assignment.is_published) {
      return {
        text: 'Draft',
        color: 'text-orange-700',
        bg: 'bg-orange-100',
        icon: <FaEdit className="text-orange-600 mr-1" />,
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
            icon: <FaEye className="text-green-600 mr-1" />,
          };
        }
        return {
          text: 'Submitted',
          color: 'text-blue-700',
          bg: 'bg-blue-100',
          icon: <FaEye className="text-blue-600 mr-1" />,
        };
      }

      if (isOverdue(assignment.due_date)) {
        return {
          text: 'Overdue',
          color: 'text-red-700',
          bg: 'bg-red-100',
          icon: <FaClock className="text-red-600 mr-1" />,
        };
      }
    }

    return {
      text: 'Published',
      color: 'text-green-700',
      bg: 'bg-green-100',
      icon: <FaGlobe className="text-green-600 mr-1" />,
    };
  };

  // Group assignments by session
  const filteredAssignments = assignments.filter(assignment => {
    // For students, only show published assignments
    if (!isTeacher) {
      return assignment.is_published;
    }
    // For teachers, show all assignments
    return true;
  });

  const groupedAssignments = filteredAssignments.reduce((groups, assignment) => {
    const sessionTitle = assignment.session_title || 'Unknown Session';
    if (!groups[sessionTitle]) {
      groups[sessionTitle] = [];
    }
    groups[sessionTitle].push(assignment);
    return groups;
  }, {} as Record<string, Assignment[]>);

  const renderAssignmentCard = (assignment: Assignment) => {
    const status = getAssignmentStatus(assignment);
    const userSubmission = getUserSubmission(assignment);

    return (
      <div
        onClick={() => handleAssignmentClick(assignment)}
        className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-lg text-gray-800 group-hover:text-blue-600 transition-colors">
            {assignment.title}
          </h3>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} flex items-center whitespace-nowrap ml-2`}
          >
            {status.icon}
            {status.text}
          </span>
        </div>

        {/* Description */}
        {assignment.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{assignment.description}</p>}

        {/* Session Info */}
        {assignment.session_title && (
          <div className="mb-3 flex items-center text-sm text-blue-600">
            {/* <span className="mr-2">📚</span> */}
            <span>Session: {assignment.session_number}</span>
          </div>
        )}

        {/* Assignment Info */}
        <div className="space-y-2 mb-4">
          {/* <div className="flex items-center text-sm text-gray-600">
            <FaUser className="mr-2 text-xs" />
            <span>Type: {assignment.assignment_type}</span>
          </div>

          <div className="flex items-center text-sm text-gray-600">
            <span className="mr-2">🎯</span>
            <span>{assignment.total_points} points</span>
          </div> */}

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

          {/* {assignment.questions && (
            <div className="flex items-center text-sm text-gray-600">
              <span className="mr-2">❓</span>
              <span>
                {assignment.questions.length} question{assignment.questions.length !== 1 ? 's' : ''}
              </span>
            </div>
          )} */}
        </div>

        {/* User Submission Info */}
        {!isTeacher && userSubmission && (
          <div className="border-t pt-3 mt-3">
            <div className="text-sm text-gray-600">
              <p>
                Attempt: {userSubmission.attempt_number}/{assignment.attempts_allowed}
              </p>
              {userSubmission.submitted_at && <p>Submitted: {formatDateTime(userSubmission.submitted_at)}</p>}
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
          {isTeacher ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleAssignmentClick(assignment)}
                className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600"
              >
                <FaEye />
                View & Manage
              </button>
              <button
                onClick={e => handleEditClick(assignment, e)}
                className="px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800"
                title="Edit Assignment"
              >
                <FaEdit />
              </button>
              <button
                onClick={e => handlePublishToggle(assignment, e)}
                className={`px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  assignment.is_published
                    ? 'bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800'
                    : 'bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800'
                }`}
                title={assignment.is_published ? 'Unpublish Assignment' : 'Publish Assignment'}
              >
                {assignment.is_published ? <FaEyeSlash /> : <FaGlobe />}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleAssignmentClick(assignment)}
              className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600"
            >
              <FaEye />
              View Assignment
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">All Assignments</h2>
          <div className="flex items-center gap-4 mt-1">
            {/* <p className="text-gray-600">
              {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''} {isTeacher ? 'across all sessions' : 'published'}
            </p> */}
            {isTeacher && assignments.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-700">{assignments.filter(a => a.is_published).length} Published</span>
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-orange-700">{assignments.filter(a => !a.is_published).length} Draft</span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Bulk Actions for Teachers */}
          {isTeacher && assignments.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkPublish(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1 transition-colors"
                title="Publish all draft assignments"
              >
                <FaGlobe className="text-xs" />
                Publish All
              </button>
              <button
                onClick={() => handleBulkPublish(false)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1 transition-colors"
                title="Unpublish all published assignments"
              >
                <FaEyeSlash className="text-xs" />
                Unpublish All
              </button>
            </div>
          )}

          {/* View Toggle - only show if there are assignments to view */}
          {filteredAssignments.length > 0 && (
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setViewMode('by-session')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  viewMode === 'by-session' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Session
              </button>
            </div>
          )}

          {isTeacher && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <FaPlus />
              Create Assignment
            </button>
          )}
        </div>
      </div>

      {/* Assignments Grid */}
      {filteredAssignments.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No assignments yet</h3>
          <p className="text-gray-500">
            {isTeacher
              ? 'Create your first assignment in any session to get started.'
              : 'No assignments have been published for this course yet.'}
          </p>
        </div>
      ) : viewMode === 'all' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssignments.map(assignment => (
            <div key={assignment.id}>{renderAssignmentCard(assignment)}</div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedAssignments).map(([sessionTitle, sessionAssignments]) => (
            <div key={sessionTitle} className="space-y-4">
              <div className="border-b border-gray-200 pb-2">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                  {/* <span className="mr-2">📚</span> */}
                  {/* {sessionAssignments[0].session_number ? (
                    <span className="text-blue-600 mr-2">Session {sessionAssignments[0].session_number}</span>
                  ) : null} */}
                  {sessionTitle}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({sessionAssignments.length} assignment{sessionAssignments.length !== 1 ? 's' : ''})
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessionAssignments.map(assignment => (
                  <div key={assignment.id}>{renderAssignmentCard(assignment)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Assignment Modal */}
      <AssignmentCreateModal
        sessionId={sessionId}
        courseCode={courseCode}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit Assignment Modal */}
      <AssignmentCreateModal
        sessionId={sessionId}
        courseCode={courseCode}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedAssignment(null);
        }}
        onSuccess={handleEditSuccess}
        editAssignment={selectedAssignment}
      />

      {/* Assignment Detail Modal */}
      <AssignmentDetailModal
        assignment={selectedAssignment}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAssignment(null);
        }}
        isTeacher={isTeacher}
        currentUserId={currentUserId || undefined}
        onSubmitAnswer={handleSubmitAnswer}
        onEdit={assignment => {
          setShowDetailModal(false);
          setSelectedAssignment(selectedAssignment); // Use the selectedAssignment from state
          setShowEditModal(true);
        }}
      />
    </div>
  );
}
