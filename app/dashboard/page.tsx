'use client';

import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';
import Footer from '../../components/common/footer';
import { useState, useEffect } from 'react';
<<<<<<< HEAD
import { FaClock, FaUser, FaUserFriends, FaClipboard, FaBook, FaFile, FaExternalLinkAlt } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { useSchedule, getUpcomingClass } from '@/hooks';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

interface MaterialItem {
  id: number;
  title: string;
  content?: string;
  created_at: string;
  session_id: number;
  session_title: string;
  session_number: number;
  course_code: string;
  course_name: string;
  class_name: string;
  teacher_name?: string;
  type: 'material';
}

interface ResourceItem {
  id: number;
  title: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  session_id: number;
  session_title: string;
  session_number: number;
  course_code: string;
  course_name: string;
  class_name: string;
  uploader_name?: string;
  type: 'resource';
}

type DashboardItem = MaterialItem | ResourceItem;

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
=======
import { FaClock, FaUser, FaUserFriends, FaClipboard } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';
import { useSchedule, getUpcomingClass } from '@/hooks';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
>>>>>>> test-plagiarism-correction-feature

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
<<<<<<< HEAD
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
=======
>>>>>>> test-plagiarism-correction-feature

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

<<<<<<< HEAD
  // Fetch materials and resources
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setLoadingMaterials(true);
        const response = await fetch('/api/dashboard/materials?limit=5');
        const result = await response.json();

        if (result.success) {
          setMaterials(result.data.materials || []);
          setResources(result.data.resources || []);
        }
      } catch (error) {
        console.error('Error fetching materials:', error);
      } finally {
        setLoadingMaterials(false);
      }
    };

    if (userRole) {
      fetchMaterials();
    }
  }, [userRole]);

=======
>>>>>>> test-plagiarism-correction-feature
  // Get schedule data for upcoming class
  const { scheduleData, loading } = useSchedule();
  const upcomingClass = getUpcomingClass(scheduleData);

<<<<<<< HEAD
  // Combine materials and resources, sort by date
  const allItems: DashboardItem[] = [...materials, ...resources].sort((a, b) => {
    const dateA = 'created_at' in a ? new Date(a.created_at).getTime() : 0;
    const dateB = 'created_at' in b ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  }).slice(0, 5);
=======
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
>>>>>>> test-plagiarism-correction-feature

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
<<<<<<< HEAD
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Materials Section */}
            <div className="md:col-span-2 bg-white p-4 rounded-md shadow">
              <h2 className="text-xl font-semibold mb-4 text-gray-600 flex items-center gap-2">
                <FaBook className="text-blue-500" />
                Materi Terbaru
              </h2>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {loadingMaterials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : allItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FaBook className="text-4xl mx-auto mb-2 text-gray-300" />
                    <p>Belum ada materi terbaru</p>
                  </div>
                ) : (
                  allItems.map((item) => (
                    <Card
                      key={`${item.type}-${item.id}`}
                      className="border border-gray-200 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-blue-300 cursor-pointer hover:bg-blue-50"
                      onClick={() => {
                        if (item.course_code && item.session_id) {
                          router.push(`/course/${item.course_code}?sessionId=${item.session_id}`);
                        }
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {item.type === 'material' ? (
                                <FaBook className="text-blue-500 flex-shrink-0" />
                              ) : (
                                <FaFile className="text-green-500 flex-shrink-0" />
                              )}
                              <p className="font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">
                              {item.course_name} • {item.class_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Session {item.session_number}: {item.session_title}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-gray-400">
                                {item.type === 'material' && 'teacher_name' in item
                                  ? `Oleh ${item.teacher_name}`
                                  : item.type === 'resource' && 'uploader_name' in item
                                    ? `Diupload oleh ${item.uploader_name}`
                                    : ''}
                              </p>
                              {'created_at' in item && (
                                <p className="text-xs text-gray-400">
                                  {formatDistanceToNow(new Date(item.created_at), {
                                    addSuffix: true,
                                    locale: id,
                                  })}
                                </p>
                              )}
                            </div>
                            {item.type === 'resource' && 'file_size' in item && (
                              <p className="text-xs text-gray-400 mt-1">
                                📎 {formatFileSize(item.file_size)}
                              </p>
                            )}
                          </div>
                          <FaExternalLinkAlt className="text-gray-400 flex-shrink-0 mt-1" size={12} />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Upcoming Class Section */}
            <div className="bg-white p-4 rounded-md shadow">
              <h2 className="text-xl font-semibold mb-4 text-gray-600">Kelas Berikutnya</h2>
=======
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
>>>>>>> test-plagiarism-correction-feature
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
<<<<<<< HEAD
                  <p className="text-gray-500">Tidak ada kelas mendatang</p>
=======
                  <p className="text-gray-500">No upcoming classes</p>
>>>>>>> test-plagiarism-correction-feature
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
