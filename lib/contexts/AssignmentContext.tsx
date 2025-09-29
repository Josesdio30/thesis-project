'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface QuestionType {
  id: number;
  name: string;
  alt_name: string | null;
}

interface SubmissionStatus {
  id: number;
  name: string;
  alt_name: string | null;
}

interface AssignmentType {
  id: number;
  name: string;
  alt_name: string | null;
}

interface AssignmentContextData {
  questionTypes: QuestionType[];
  submissionStatuses: SubmissionStatus[];
  assignmentTypes: AssignmentType[];
  loading: boolean;
  error: string | null;
}

const AssignmentContext = createContext<AssignmentContextData | undefined>(undefined);

export const useAssignmentContext = () => {
  const context = useContext(AssignmentContext);
  if (context === undefined) {
    throw new Error('useAssignmentContext must be used within an AssignmentProvider');
  }
  return context;
};

interface AssignmentProviderProps {
  children: React.ReactNode;
}

export const AssignmentProvider: React.FC<AssignmentProviderProps> = ({ children }) => {
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus[]>([]);
  const [assignmentTypes, setAssignmentTypes] = useState<AssignmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [questionTypesResponse, submissionStatusesResponse, assignmentTypesResponse] = await Promise.all([
          fetch('/api/question-types'),
          fetch('/api/submission-statuses'),
          fetch('/api/assignment-types'),
        ]);

        if (!questionTypesResponse.ok || !submissionStatusesResponse.ok || !assignmentTypesResponse.ok) {
          throw new Error('Failed to fetch assignment data');
        }

        const [questionTypesData, submissionStatusesData, assignmentTypesData] = await Promise.all([
          questionTypesResponse.json(),
          submissionStatusesResponse.json(),
          assignmentTypesResponse.json(),
        ]);

        setQuestionTypes(questionTypesData);
        setSubmissionStatuses(submissionStatusesData);
        setAssignmentTypes(assignmentTypesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        console.error('Error fetching assignment context data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const value: AssignmentContextData = {
    questionTypes,
    submissionStatuses,
    assignmentTypes,
    loading,
    error,
  };

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
};
