import { useState, useEffect, useCallback } from 'react';

export interface Assignment {
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
  assignment_type?: string;
  created_date: string;
  questions?: any[];
  submissions?: any[];
  session_id?: number;
  session_title?: string;
  session_number?: number;
}

export const useAssignmentData = (courseCode: string) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
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
  }, [courseCode]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return { assignments, loading, refetch: fetchAssignments };
};
