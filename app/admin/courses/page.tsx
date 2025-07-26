'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Sidebar from '../../_components/sidebar';
import Topbar from '../../_components/topbar';
import { useSession } from 'next-auth/react';

interface Course {
  id: number;
  course_code: string;
  course_name: string;
  description: string;
}

const CourseManagement = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [form, setForm] = useState({
    course_code: '',
    course_name: '',
    description: '',
  });

  useEffect(() => {
    // Cek session dan role
    if (status === 'loading') return;
    
    if (!session?.user) {
      router.replace('/login');
      return;
    }

    // Cek role dari session
    const userRole = session.user.role;
    if (userRole?.toLowerCase() !== 'admin') {
      router.replace('/login');
      return;
    }
  }, [session, status, router]);

  // Fetch courses dari database
  useEffect(() => {
    if (session?.user) {
      fetchCourses();
    }
  }, [session]);

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/admin/courses');
      const data = await res.json();
      if (data.success) {
        setCourses(data.data.courses);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal menambah course');
      
      setCourses(prev => [...prev, data.course]);
      setForm({ course_code: '', course_name: '', description: '' });
      setShowAddModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${selectedCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal mengupdate course');
      
      setCourses(prev => prev.map(course => 
        course.id === selectedCourse.id ? data.course : course
      ));
      setForm({ course_code: '', course_name: '', description: '' });
      setShowEditModal(false);
      setSelectedCourse(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus course ini?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal menghapus course');
      
      setCourses(prev => prev.filter(course => course.id !== courseId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (course: Course) => {
    setSelectedCourse(course);
    setForm({
      course_code: course.course_code,
      course_name: course.course_name,
      description: course.description,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setForm({ course_code: '', course_name: '', description: '' });
    setError(null);
  };

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
        
        <div className="flex-1 p-6">
          {status === 'loading' ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading...</p>
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Course Management</h1>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  + Add Course
                </button>
              </div>

              {/* Course List */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Daftar Courses</h2>
                  {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                      {error}
                    </div>
                  )}
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Kode</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Nama Course</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Deskripsi</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courses.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center py-4 text-gray-500">Belum ada courses</td>
                          </tr>
                        ) : (
                          courses.map((course) => (
                            <tr key={course.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 font-medium">{course.course_code}</td>
                              <td className="border border-gray-300 px-4 py-2">{course.course_name}</td>
                              <td className="border border-gray-300 px-4 py-2">{course.description}</td>
                              <td className="border border-gray-300 px-4 py-2">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => openEditModal(course)}
                                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCourse(course.id)}
                                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Add Course Modal */}
    {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Course</h3>
            <form onSubmit={handleAddCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Course</label>
                <input
                  type="text"
                  name="course_code"
                  value={form.course_code}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Course</label>
                <input
                  type="text"
                  name="course_name"
                  value={form.course_name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {showEditModal && selectedCourse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Course</h3>
            <form onSubmit={handleEditCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Course</label>
                <input
                  type="text"
                  name="course_code"
                  value={form.course_code}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Course</label>
                <input
                  type="text"
                  name="course_name"
                  value={form.course_name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Update'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedCourse(null);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseManagement; 