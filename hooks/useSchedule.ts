'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/types';

export interface ScheduleItem {
  id: number;
  subject: string;
  teacher: string;
  session_title: string;
  class_name: string;
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

export function useSchedule(selectedDate?: Date, currentMonth?: Date) {
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async (date?: Date, month?: Date) => {
    try {
      setLoading(true);
      setError(null);

      let url = '/api/schedule';
      const params = new URLSearchParams();

      if (date) {
        // Use local date formatting to avoid timezone conversion issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        params.append('date', dateString);
      } else if (month) {
        // Add month parameter for monthly filtering
        const year = month.getFullYear();
        const monthNum = String(month.getMonth() + 1).padStart(2, '0');
        const monthString = `${year}-${monthNum}`;
        params.append('month', monthString);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
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

  // Fetch schedule data on mount - default to current month
  useEffect(() => {
    fetchSchedule(undefined, currentMonth || new Date());
  }, [fetchSchedule, currentMonth]);
  // Fetch specific date schedule when selectedDate changes
  const fetchDateSchedule = useCallback(
    (date: Date) => {
      fetchSchedule(date);
    },
    [fetchSchedule]
  );

  // Fetch schedule for a specific month
  const fetchMonthSchedule = useCallback(
    (month: Date) => {
      fetchSchedule(undefined, month);
    },
    [fetchSchedule]
  );

  return {
    scheduleData,
    loading,
    error,
    fetchSchedule,
    fetchDateSchedule,
    fetchMonthSchedule,
    refetch: () => fetchSchedule(selectedDate, currentMonth || new Date()),
  };
}

// Function to get the next upcoming class from today onwards
export function getUpcomingClass(scheduleData: ScheduleData | null): ScheduleItem | null {
  if (!scheduleData) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let allSessions: ScheduleItem[] = [];

  // Flatten schedule data
  if (Array.isArray(scheduleData.schedule)) {
    allSessions = scheduleData.schedule;
  } else if (typeof scheduleData.schedule === 'object') {
    allSessions = Object.values(scheduleData.schedule).flat();
  }

  // Filter sessions from today onwards and sort by start time
  const upcomingSessions = allSessions
    .filter(session => {
      const sessionDate = new Date(session.start_time);
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

      // Include sessions from today onwards
      if (sessionDay >= today) {
        // If it's today, only include sessions that haven't started yet
        if (sessionDay.getTime() === today.getTime()) {
          return sessionDate > now;
        }
        return true;
      }
      return false;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  return upcomingSessions.length > 0 ? upcomingSessions[0] : null;
}
