'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Sidebar from '../../_components/sidebar';
import Topbar from '../../_components/topbar';
import { useSession } from 'next-auth/react';

interface Class {
  id: number;
  name: string;
  grade_level: string;
  year_name: string;
  year_id: number;
}

interface AcademicYear {
  id: number;
  year_name: string;
  is_active: boolean;
}

const ClassManagement = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [form, setForm] = useState({
    class_name: '',
    grade_level: '',
    year_id: '',
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

  // Fetch classes dan academic years dari database
  useEffect(() => {
    if (session?.user) {
      fetchClasses();
      fetchAcademicYears();
    }
  }, [session]);

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/admin/classes');
      const data = await res.json();
      if (data.success) {
        setClasses(data.data.classes);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const res = await fetch('/api/admin/academic-years');
      const data = await res.json();
      if (data.success) {
        setAcademicYears(data.data.academic_years);
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal menambah class');
      
      setClasses(prev => [...prev, data.class]);
      setForm({ class_name: '', grade_level: '', year_id: '' });
      setShowAddModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/classes/${selectedClass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal mengupdate class');
      
      setClasses(prev => prev.map(cls => 
        cls.id === selectedClass.id ? data.class : cls
      ));
      setForm({ class_name: '', grade_level: '', year_id: '' });
      setShowEditModal(false);
      setSelectedClass(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (classId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus class ini?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/classes/${classId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal menghapus class');
      
      setClasses(prev => prev.filter(cls => cls.id !== classId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (cls: Class) => {
    setSelectedClass(cls);
    setForm({
      class_name: cls.name,
      grade_level: cls.grade_level,
      year_id: cls.year_id.toString(),
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setForm({ class_name: '', grade_level: '', year_id: '' });
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
                <h1 className="text-2xl font-bold">Class Management</h1>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  + Add Class
                </button>
              </div>

              {/* Class List */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Daftar Classes</h2>
                  {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                      {error}
                    </div>
                  )}
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Nama Class</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Grade Level</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Academic Year</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classes.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center py-4 text-gray-500">Belum ada classes</td>
                          </tr>
                        ) : (
                          classes.map((cls) => (
                            <tr key={cls.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2 font-medium">{cls.name}</td>
                              <td className="border border-gray-300 px-4 py-2">{cls.grade_level}</td>
                              <td className="border border-gray-300 px-4 py-2">{cls.year_name}</td>
                              <td className="border border-gray-300 px-4 py-2">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => openEditModal(cls)}
                                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClass(cls.id)}
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

      {/* Add Class Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Class</h3>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Class</label>
                <input
                  type="text"
                  name="class_name"
                  value={form.class_name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: X-MIPA"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
                <select
                  name="grade_level"
                  value={form.grade_level}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Pilih grade level</option>
                  <option value="X">X</option>
                  <option value="XI">XI</option>
                  <option value="XII">XII</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <select
                  name="year_id"
                  value={form.year_id}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Pilih academic year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.year_name} {year.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
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

      {/* Edit Class Modal */}
      {showEditModal && selectedClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Class</h3>
            <form onSubmit={handleEditClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Class</label>
                <input
                  type="text"
                  name="class_name"
                  value={form.class_name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: X-MIPA"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
                <select
                  name="grade_level"
                  value={form.grade_level}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Pilih grade level</option>
                  <option value="X">X</option>
                  <option value="XI">XI</option>
                  <option value="XII">XII</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <select
                  name="year_id"
                  value={form.year_id}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Pilih academic year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.year_name} {year.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
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
                    setSelectedClass(null);
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

export default ClassManagement; 