'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/types';

export interface ScheduleItem {
  id: number;
  subject: string;
  teacher: string;
  session_title: string;
  description?: string;
  start_time: string;
  end_time: string;
  time: string;
  date: string;
  course_code?: string;
  session_number: number;
  is_completed: boolean;
}

export interface ScheduleData {
  schedule: Record<string, ScheduleItem[]> | ScheduleItem[];
  dates_with_schedule?: string[];
  date?: string;
  user_role: 'student' | 'teacher' | 'admin';
}

export function useSchedule(selectedDate?: Date) {
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async (date?: Date) => {
    try {
      setLoading(true);
      setError(null);

      let url = '/api/schedule';
      if (date) {
        const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        url += `?date=${dateString}`;
      }

      const response = await fetch(url);
      const result: ApiResponse<ScheduleData> = await response.json();

      if (result.success && result.data) {
        setScheduleData(result.data);
      } else {
        setError(result.error || 'Failed to fetch schedule');
        setScheduleData(null);
      }
    } catch (err) {
      setError('Network error');
      setScheduleData(null);
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all schedule data on mount
  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Fetch specific date schedule when selectedDate changes
  const fetchDateSchedule = useCallback(
    (date: Date) => {
      fetchSchedule(date);
    },
    [fetchSchedule]
  );

  return {
    scheduleData,
    loading,
    error,
    fetchSchedule,
    fetchDateSchedule,
    refetch: () => fetchSchedule(selectedDate),
  };
}
