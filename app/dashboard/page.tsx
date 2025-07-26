'use client';

import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';
import Footer from '../../components/common/footer';
import { useState, useEffect } from 'react';
import { FaClock, FaUser, FaUserFriends, FaClipboard } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { useSchedule, getUpcomingClass } from '@/hooks';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Check user role and redirect admin to schedule
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          if (data.user?.role === 'ADMIN') {
            router.push('/schedule');
            return;
          }
          setUserRole(data.user?.role || '');
        }
      } catch (error) {
        console.error('Error checking user role:', error);
      }
    };

    checkUserRole();
  }, [router]);

  // Get schedule data for upcoming class
  const { scheduleData, loading } = useSchedule();
  const upcomingClass = getUpcomingClass(scheduleData);

  const latestForumPosts = [
    {
      id: 1,
      author: 'Benedictus Dhaniar Ardra',
      date: '18 Feb 2025, 08:00 GMT+7',
      title: 'Pembahasan Future Past',
      subject: 'IX - 1 Bahasa Inggris Lanjut (A) (Peminatan) XI MIPA',
    },
    {
      id: 2,
      author: 'Samuel Prakoso',
      date: '18 Feb 2025, 08:00 GMT+7',
      title: 'Pembahasan Future Past',
      subject: 'IX - 1 Bahasa Inggris Lanjut (A) (Peminatan) XI MIPA',
    },
  ];

  // Show loading while checking role
  if (userRole === '') {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex flex-col flex-1">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
      <div className="flex flex-col flex-1">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 p-6">
          {/* <div className="bg-gray-800 text-white p-2 rounded-md mb-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div> */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-white p-4 rounded-md shadow">
              <h2 className="text-xl font-semibold mb-4 text-gray-600">Latest Forum Post</h2>
              <div className="space-y-4">
                {latestForumPosts.map(post => (
                  <div key={post.id} className="p-4 border rounded-md shadow-sm">
                    <p className="font-medium text-gray-600">{post.author}</p>
                    <p className="text-xs text-gray-600">{post.date}</p>
                    <p className="font-semibold mt-2 text-gray-600">{post.title}</p>
                    <p className="text-sm text-gray-600">{post.subject}</p>
                  </div>
                ))}
              </div>
            </div>{' '}
            <div className="bg-white p-4 rounded-md shadow">
              <h2 className="text-xl font-semibold mb-4 text-gray-600">Upcoming Class</h2>
              {loading ? (
                <div className="p-4 border rounded-md shadow-sm">
                  <p className="text-gray-500">Loading...</p>
                </div>
              ) : upcomingClass ? (
                <Card
                  className="border border-gray-300 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-blue-300 cursor-pointer hover:bg-blue-50"
                  onClick={() => {
                    if (upcomingClass.course_code && upcomingClass.id) {
                      router.push(`/course/${upcomingClass.course_code}?sessionId=${upcomingClass.id}`);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <p className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2">
                      <FaUser className="text-blue-500" /> {upcomingClass.teacher}
                    </p>

                    <p className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                      <FaClipboard className="text-green-500" /> {upcomingClass.course_code}
                    </p>

                    <p className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                      <FaUserFriends className="text-green-500" /> {upcomingClass.class_name}
                    </p>

                    <p className="text-sm text-gray-600 flex items-center gap-2 mb-2">
                      <FaClock className="text-green-500" /> {upcomingClass.time}
                    </p>

                    <p className="text-sm text-gray-600 mb-1">
                      {format(new Date(upcomingClass.start_time), 'EEEE, MMM dd, yyyy')}
                    </p>

                    {upcomingClass.session_title && (
                      <p className="text-sm text-gray-800 font-medium mb-1">
                        Session {upcomingClass.session_number}: {upcomingClass.session_title}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="p-4 border rounded-md shadow-sm">
                  <p className="text-gray-500">No upcoming classes</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
