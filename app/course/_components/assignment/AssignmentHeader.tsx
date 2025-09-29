import React from 'react';
import { Assignment } from '../../../../hooks/useAssignmentData';
import { FaPlus, FaGlobe, FaEyeSlash } from 'react-icons/fa';

interface AssignmentHeaderProps {
  filteredAssignments: Assignment[];
  assignments: Assignment[];
  isTeacher: boolean;
  viewMode: 'all' | 'by-session';
  onViewModeChange: (mode: 'all' | 'by-session') => void;
  onCreateClick: () => void;
  onBulkPublish: (publish: boolean) => void;
}

export const AssignmentHeader = ({
  filteredAssignments,
  assignments,
  isTeacher,
  viewMode,
  onViewModeChange,
  onCreateClick,
  onBulkPublish,
}: AssignmentHeaderProps) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Assignments ({filteredAssignments.length})</h2>

        {/* View Mode Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onViewModeChange('all')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => onViewModeChange('by-session')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'by-session' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Session
          </button>
        </div>
      </div>

      {isTeacher && (
        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {assignments.length > 0 && (
            <>
              <button
                onClick={() => onBulkPublish(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800 rounded-lg transition-colors"
                title="Publish All"
              >
                <FaGlobe className="text-xs" />
                Publish All
              </button>
              <button
                onClick={() => onBulkPublish(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 rounded-lg transition-colors"
                title="Unpublish All"
              >
                <FaEyeSlash className="text-xs" />
                Unpublish All
              </button>
            </>
          )}

          {/* Create Button */}
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <FaPlus className="text-sm" />
            Create Assignment
          </button>
        </div>
      )}
    </div>
  );
};
