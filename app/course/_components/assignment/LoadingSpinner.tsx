import React from 'react';
import { FaSpinner } from 'react-icons/fa';

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3">
        <FaSpinner className="animate-spin text-blue-600 text-xl" />
        <span className="text-gray-600">Loading assignments...</span>
      </div>
    </div>
  );
};
