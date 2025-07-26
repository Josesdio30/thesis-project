'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FaBook, FaCalendarAlt, FaClock, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';

interface Assignment {
  id: number;
  title: string;
  description: string;
  total_points: number;
  due_date: string;
  time_limit: number;
  attempts_allowed: number;
  is_published: boolean;
  sessions: {
    class_courses: {
      courses: {
        course_name: string;
        course_code: string;
      };
      classes: {
        class_name: string;
      };
    };
  };
  enumeration: {
    name: string;
  };
}

export default function AssignmentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await fetch('/api/assignments');
      if (response.ok) {
        const data = await response.json();
        setAssignments(data.data.assignments);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <div className="flex items-center justify-center w-full">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0 overflow-y-auto">
        <Topbar onMenuClick={handleMenuClick} />

        <div className="grid grid-cols-1 gap-6 pt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <FaBook className="text-blue-600" />
                My Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignments.map((assignment) => (
                    <Card key={assignment.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg font-semibold text-gray-900">
                              {assignment.title}
                            </CardTitle>
                            <p className="text-sm text-gray-600 mt-1">
                              {assignment.sessions.class_courses.courses.course_name} - {assignment.sessions.class_courses.courses.course_code}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {assignment.sessions.class_courses.classes.class_name}
                            </p>
                          </div>
                          <Badge variant={assignment.enumeration.name === 'EXAM' ? 'destructive' : 'default'}>
                            {assignment.enumeration.name}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-gray-700 mb-3">
                          {assignment.description}
                        </p>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaCalendarAlt className="text-blue-500" />
                            <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaClock className="text-green-500" />
                            <span>Time Limit: {assignment.time_limit} minutes</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>Points: {assignment.total_points}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                            Start Assignment
                          </Button>
                          <div className="flex items-center gap-1">
                            <FaCheckCircle className="text-green-500 text-sm" />
                            <span className="text-xs text-gray-500">Completed</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FaBook className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No assignments</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    You don't have any assignments yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
