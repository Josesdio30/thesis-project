import React from 'react';
import { FaBook, FaPlus } from 'react-icons/fa';

interface EmptyStateProps {
  isTeacher: boolean;
  onCreateClick?: () => void;
}

export const EmptyState = ({ isTeacher, onCreateClick }: EmptyStateProps) => {
  return (
    <div className="text-center py-12">
      <FaBook className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {isTeacher ? 'No assignments created yet' : 'No assignments available'}
      </h3>
      <p className="text-gray-500 mb-6">
        {isTeacher
          ? 'Create your first assignment to get started with course assessments.'
          : "Your teacher hasn't published any assignments yet. Check back later!"}
      </p>
      {/* {isTeacher && onCreateClick && (
        <button
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          <FaPlus className="text-sm" />
          Create Assignment
        </button>
      )} */}
    </div>
  );
};
