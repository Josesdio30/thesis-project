'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Sidebar from '../../_components/sidebar';
import Topbar from '../../_components/topbar';
import { useSession } from 'next-auth/react';

interface AcademicYear {
  id: number;
  year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean | null;
}

const AcademicYearManagement = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState({
    year_name: '',
    start_date: '',
    end_date: '',
    is_active: false,
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

  // Fetch academic years dari database
  useEffect(() => {
    if (session?.user) {
      fetchAcademicYears();
    }
  }, [session]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Gagal menambah tahun ajaran');
      
      // Refresh list
      await fetchAcademicYears();
      resetForm();
      setShowAddModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYear) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/academic-years/${selectedYear.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Gagal mengupdate tahun ajaran');
      
      // Refresh list
      await fetchAcademicYears();
      resetForm();
      setShowEditModal(false);
      setSelectedYear(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteYear = async (yearId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus tahun ajaran ini? Semua kelas yang terkait juga akan terpengaruh.')) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/academic-years/${yearId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Gagal menghapus tahun ajaran');
      
      setAcademicYears(prev => prev.filter(year => year.id !== yearId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (year: AcademicYear) => {
    setSelectedYear(year);
    // Format dates to YYYY-MM-DD for date inputs
    const start = year.start_date ? new Date(year.start_date).toISOString().split('T')[0] : '';
    const end = year.end_date ? new Date(year.end_date).toISOString().split('T')[0] : '';
    setForm({
      year_name: year.year_name,
      start_date: start,
      end_date: end,
      is_active: !!year.is_active,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setForm({ year_name: '', start_date: '', end_date: '', is_active: false });
    setError(null);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
        
        <div className="flex-1 p-6 overflow-y-auto">
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
                <h1 className="text-2xl font-bold">Academic Year Management</h1>
                <button
                  onClick={() => { resetForm(); setShowAddModal(true); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  + Add Academic Year
                </button>
              </div>

              {/* Error Notification */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {/* List Table */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4 font-sans">Daftar Tahun Ajaran</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Nama Tahun Ajaran</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Tanggal Mulai</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Tanggal Selesai</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                          <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {academicYears.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-4 text-gray-500">Belum ada tahun ajaran</td>
                          </tr>
                        ) : (
                          academicYears.map((year) => (
                            <tr key={year.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2">{year.year_name}</td>
                              <td className="border border-gray-300 px-4 py-2">{formatDate(year.start_date)}</td>
                              <td className="border border-gray-300 px-4 py-2">{formatDate(year.end_date)}</td>
                              <td className="border border-gray-300 px-4 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  year.is_active 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {year.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="border border-gray-300 px-4 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openEditModal(year)}
                                    className="bg-yellow-500 text-white px-3 py-1 rounded text-xs hover:bg-yellow-600 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteYear(year.id)}
                                    className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 transition-colors"
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

              {/* Add Modal */}
              {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                    <h2 className="text-xl font-bold mb-4">Add Academic Year</h2>
                    <form onSubmit={handleAddYear}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nama Tahun Ajaran</label>
                          <input
                            type="text"
                            name="year_name"
                            value={form.year_name}
                            onChange={handleChange}
                            placeholder="Contoh: 2025/2026"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                          <input
                            type="date"
                            name="start_date"
                            value={form.start_date}
                            onChange={handleChange}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Selesai</label>
                          <input
                            type="date"
                            name="end_date"
                            value={form.end_date}
                            onChange={handleChange}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            name="is_active"
                            id="is_active_add"
                            checked={form.is_active}
                            onChange={handleChange}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="is_active_add" className="ml-2 block text-sm text-gray-900">
                            Jadikan tahun ajaran aktif
                          </label>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowAddModal(false); resetForm(); }}
                          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {loading ? 'Menyimpan...' : 'Simpan'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Modal */}
              {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                    <h2 className="text-xl font-bold mb-4">Edit Academic Year</h2>
                    <form onSubmit={handleEditYear}>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nama Tahun Ajaran</label>
                          <input
                            type="text"
                            name="year_name"
                            value={form.year_name}
                            onChange={handleChange}
                            placeholder="Contoh: 2025/2026"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                          <input
                            type="date"
                            name="start_date"
                            value={form.start_date}
                            onChange={handleChange}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Selesai</label>
                          <input
                            type="date"
                            name="end_date"
                            value={form.end_date}
                            onChange={handleChange}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            name="is_active"
                            id="is_active_edit"
                            checked={form.is_active}
                            onChange={handleChange}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="is_active_edit" className="ml-2 block text-sm text-gray-900">
                            Jadikan tahun ajaran aktif
                          </label>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowEditModal(false); resetForm(); setSelectedYear(null); }}
                          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {loading ? 'Menyimpan...' : 'Simpan'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcademicYearManagement;
