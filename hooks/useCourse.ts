'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/types';

export interface CourseData {
  id: number;
  course_code: string;
  course_name: string;
  description?: string;
  class_name?: string;
  grade_level?: string;
  academic_year?: string;
  teacher_name?: string;
  student_count?: number;
  session_count?: number;
  start_date?: Date;
  end_date?: Date;
  is_active?: boolean;
  syllabus?: string;
  created_at?: Date;
  updated_at?: Date;
  class_courses?: any[];
}

export interface CourseDetailData {
  id: number;
  course_code: string;
  course_name: string;
  description?: string;
  created_at?: Date;
  updated_at?: Date;
  class_courses: Array<{
    id: number;
    class_id: number;
    class_name: string;
    grade_level: string;
    academic_year: string;
    wali_kelas: string;
    teacher: {
      id: number;
      nama_lengkap: string;
      email: string;
      kode_guru: string;
      profile_picture_url?: string;
    };
    students: Array<{
      id: number;
      nama_lengkap: string;
      email: string;
      nis: string;
      roll_number?: number;
      enrollment_date: Date;
      profile_picture_url?: string;
    }>;
    sessions: Array<{
      id: number;
      title: string;
      description?: string;
      session_number: number;
      start_time: Date;
      end_time: Date;
      is_completed: boolean;
      completed_at?: Date;
      materials: Array<{
        id: number;
        title: string;
        content?: string;
        material_order: number;
        created_at: Date;
      }>;
      resources: Array<{
        id: number;
        file_name: string;
        file_url: string;
        file_size: number;
        file_type: string;
        content_type?: string;
        is_public: boolean;
        download_count: number;
        uploader?: string;
      }>;
      forum?: {
        id: number;
        title: string;
        description?: string;
        created_at: Date;
        creator: string;
        posts: Array<{
          id: number;
          title: string;
          content: string;
          content_type: string;
          created_at: Date;
          updated_at: Date;
          author: string;
          reply_count: number;
          is_deleted: boolean;
        }>;
      } | null;
      attendance_summary: {
        total_students: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
      };
    }>;
    start_date: Date;
    end_date: Date;
    is_active: boolean;
    syllabus?: string;
  }>;
}

export function useCourses(filters?: { teacherId?: number; studentId?: number }) {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.teacherId) {
        params.append('teacherId', filters.teacherId.toString());
      }
      if (filters?.studentId) {
        params.append('studentId', filters.studentId.toString());
      }

      const url = `/api/courses${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      const result: ApiResponse<CourseData[]> = await response.json();

      if (result.success && result.data) {
        setCourses(result.data);
      } else {
        setError(result.error || 'Failed to fetch courses');
      }
    } catch (err) {
      setError('Network error');
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.teacherId, filters?.studentId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const createCourse = async (courseData: {
    course_code: string;
    course_name: string;
    description?: string;
    created_by?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseData)
      });

      const result: ApiResponse<CourseData> = await response.json();

      if (result.success) {
        await fetchCourses(); // Refresh the list
        return result.data;
      } else {
        setError(result.error || 'Failed to create course');
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Network error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    courses,
    loading,
    error,
    fetchCourses,
    createCourse,
    refetch: fetchCourses
  };
}

export function useCourse(courseCode?: string) {
  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCourse = useCallback(async (code: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${code}`);
      const result: ApiResponse<CourseDetailData> = await response.json();

      if (result.success && result.data) {
        setCourse(result.data);
      } else {
        setError(result.error || 'Failed to fetch course');
        setCourse(null);
      }
    } catch (err) {
      setError('Network error');
      setCourse(null);
      console.error('Error fetching course:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (courseCode) {
      fetchCourse(courseCode);
    }
  }, [courseCode, fetchCourse]);

  const updateCourse = async (
    code: string,
    courseData: {
      course_name?: string;
      description?: string;
      updated_by?: number;
    }
  ) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseData)
      });

      const result: ApiResponse<CourseDetailData> = await response.json();

      if (result.success && result.data) {
        setCourse(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to update course');
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Network error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteCourse = async (code: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/courses/${code}`, {
        method: 'DELETE'
      });

      const result: ApiResponse<null> = await response.json();

      if (result.success) {
        setCourse(null);
        return true;
      } else {
        setError(result.error || 'Failed to delete course');
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Network error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    course,
    loading,
    error,
    fetchCourse,
    updateCourse,
    deleteCourse,
    refetch: () => courseCode && fetchCourse(courseCode)
  };
}
