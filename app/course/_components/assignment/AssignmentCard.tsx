import React from 'react';
import { Assignment } from '../../../../hooks/useAssignmentData';
import {
  getAssignmentStatus,
  getUserSubmission,
  formatDateTime,
  getScoreDisplay,
  getSubmissionStatusColor,
} from '../../../../lib/assignmentUtils';
import { FaEdit, FaGlobe, FaEye, FaClock, FaEyeSlash, FaUser, FaGraduationCap } from 'react-icons/fa';

interface AssignmentCardProps {
  assignment: Assignment;
  isTeacher: boolean;
  currentUserId?: number;
  onAssignmentClick: (assignment: Assignment) => void;
  onEditClick: (assignment: Assignment, e: React.MouseEvent) => void;
  onPublishToggle: (assignment: Assignment, e: React.MouseEvent) => void;
  onGradeClick?: (assignment: Assignment, e: React.MouseEvent) => void;
}

const getStatusIcon = (iconName: string) => {
  switch (iconName) {
    case 'edit':
      return <FaEdit className="text-orange-600 mr-1" />;
    case 'eye':
      return <FaEye className="text-blue-600 mr-1" />;
    case 'clock':
      return <FaClock className="text-red-600 mr-1" />;
    case 'globe':
      return <FaGlobe className="text-green-600 mr-1" />;
    default:
      return <FaEye className="text-gray-600 mr-1" />;
  }
};

export const AssignmentCard = ({
  assignment,
  isTeacher,
  currentUserId,
  onAssignmentClick,
  onEditClick,
  onPublishToggle,
  onGradeClick,
}: AssignmentCardProps) => {
  const status = getAssignmentStatus(assignment, isTeacher, currentUserId);
  const userSubmission = currentUserId ? getUserSubmission(assignment, currentUserId) : null;

  return (
    <div
      onClick={() => onAssignmentClick(assignment)}
      className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {assignment.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              {getStatusIcon(status.iconName)}
              {status.text}
            </span>
          </div>
        </div>
        {isTeacher && (
          <div className="flex items-center gap-2">
            <button
              onClick={e => onEditClick(assignment, e)}
              className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-blue-600 transition-all"
              title="Edit Assignment"
            >
              <FaEdit />
            </button>
            {onGradeClick && assignment.submissions && assignment.submissions.length > 0 && (
              <button
                onClick={e => onGradeClick(assignment, e)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-purple-600 transition-all"
                title="Grade Submissions"
              >
                <FaGraduationCap />
              </button>
            )}
            <button
              onClick={e => onPublishToggle(assignment, e)}
              className={`opacity-0 group-hover:opacity-100 p-2 transition-all ${
                assignment.is_published ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'
              }`}
              title={assignment.is_published ? 'Unpublish' : 'Publish'}
            >
              {assignment.is_published ? <FaEyeSlash /> : <FaGlobe />}
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {assignment.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{assignment.description}</p>}

      {/* Session Info */}
      {assignment.session_title && (
        <div className="text-xs text-gray-500 mb-3">Session: {assignment.session_title}</div>
      )}

      {/* Points and Due Date */}
      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
        <span>{assignment.total_points} points</span>
        {assignment.due_date && <span>Due: {formatDateTime(assignment.due_date)}</span>}
      </div>

      {/* Student Submission Info */}
      {!isTeacher && userSubmission && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-blue-700">
              Submitted: {userSubmission.submitted_at ? formatDateTime(userSubmission.submitted_at) : 'N/A'}
            </span>
            {(() => {
              const scoreInfo = getScoreDisplay(userSubmission.total_score, assignment.total_points, assignment);

              if (scoreInfo.status === 'pending') {
                return (
                  <div className="text-right">
                    <div className="text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs font-medium">
                      ⏳ Awaiting Review
                    </div>
                  </div>
                );
              }

              if (scoreInfo.status === 'partial') {
                return (
                  <div className="text-right">
                    <div className="font-medium text-blue-800">{scoreInfo.raw}</div>
                    <div className="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs mt-1">📝 Partially graded</div>
                  </div>
                );
              }

              // Fully graded
              return (
                <div className="text-right">
                  <div className="font-medium text-blue-800">{scoreInfo.raw}</div>
                  <div
                    className={`text-xs mt-1 px-2 py-1 rounded-full ${
                      getSubmissionStatusColor(userSubmission.total_score, assignment.total_points, scoreInfo.status).bg
                    } ${
                      getSubmissionStatusColor(userSubmission.total_score, assignment.total_points, scoreInfo.status)
                        .color
                    }`}
                  >
                    {scoreInfo.percentage} - {scoreInfo.letterGrade}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Teacher Submission Stats */}
      {isTeacher && assignment.submissions && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <FaUser />
            <span>
              {assignment.submissions.length} submission{assignment.submissions.length !== 1 ? 's' : ''}
            </span>
          </div>
          {assignment.questions && (
            <span>
              {assignment.questions.length} question{assignment.questions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
