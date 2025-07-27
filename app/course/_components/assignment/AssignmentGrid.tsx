import React from 'react';
import { Assignment } from '../../../../hooks/useAssignmentData';
import { groupAssignmentsBySession } from '../../../../lib/assignmentUtils';
import { AssignmentCard } from './AssignmentCard';

interface AssignmentGridProps {
  assignments: Assignment[];
  viewMode: 'all' | 'by-session';
  isTeacher: boolean;
  currentUserId?: number;
  onAssignmentClick: (assignment: Assignment) => void;
  onEditClick: (assignment: Assignment, e: React.MouseEvent) => void;
  onPublishToggle: (assignment: Assignment, e: React.MouseEvent) => void;
  onGradeClick?: (assignment: Assignment, e: React.MouseEvent) => void;
}

export const AssignmentGrid = ({
  assignments,
  viewMode,
  isTeacher,
  currentUserId,
  onAssignmentClick,
  onEditClick,
  onPublishToggle,
  onGradeClick,
}: AssignmentGridProps) => {
  if (viewMode === 'all') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assignments.map(assignment => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            isTeacher={isTeacher}
            currentUserId={currentUserId}
            onAssignmentClick={onAssignmentClick}
            onEditClick={onEditClick}
            onPublishToggle={onPublishToggle}
            onGradeClick={onGradeClick}
          />
        ))}
      </div>
    );
  }

  // Session-grouped view
  const groupedAssignments = groupAssignmentsBySession(assignments);

  return (
    <div className="space-y-8">
      {Object.entries(groupedAssignments).map(([sessionTitle, sessionAssignments]) => (
        <div key={sessionTitle} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">{sessionTitle}</h3>
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
              {sessionAssignments.length} assignment{sessionAssignments.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessionAssignments.map(assignment => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                isTeacher={isTeacher}
                currentUserId={currentUserId}
                onAssignmentClick={onAssignmentClick}
                onEditClick={onEditClick}
                onPublishToggle={onPublishToggle}
                onGradeClick={onGradeClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
