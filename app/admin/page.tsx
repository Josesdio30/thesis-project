'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';

const AdminDashboard = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Session');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [form, setForm] = useState({
    kodeMapel: '',
    jam: '',
    tanggal: '',
  });
  const [jadwal, setJadwal] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cek user dari localStorage
    const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!userData) {
      router.replace('/login');
      return;
    }
    const user = JSON.parse(userData);
    if (user.role !== 'ADMIN') {
      router.replace('/login');
      return;
    }
  }, [router]);

  // Fetch courses dari database
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch('/api/admin/courses');
        const data = await res.json();
        if (data.success) {
          setCourses(data.courses);
        }
      } catch (error) {
        console.error('Error fetching courses:', error);
      }
    };
    fetchCourses();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal input session');
      setJadwal((prev) => [data.session, ...prev]);
      setForm({ kodeMapel: '', jam: '', tanggal: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch jadwal dari database
  useEffect(() => {
    const fetchJadwal = async () => {
      try {
        const res = await fetch('/api/admin/session');
        const data = await res.json();
        if (data.success) setJadwal(data.sessions);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      }
    };
    fetchJadwal();
  }, []);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />
        
        <div className="flex-1 p-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Dashboard Admin</h1>
            
            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-white rounded-lg p-1 mb-6 shadow-sm">
              <button
                onClick={() => setActiveTab('Session')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'Session'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Session
              </button>
              <button
                onClick={() => setActiveTab('Schedule')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'Schedule'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Schedule
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'Session' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Add Session</h2>
                <form onSubmit={handleSubmit} className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran</label>
                      <select 
                        name="kodeMapel" 
                        value={form.kodeMapel} 
                        onChange={handleChange} 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        required 
                      >
                        <option value="">Pilih mata pelajaran</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.course_code}>
                            {course.course_name} ({course.course_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jam</label>
                      <input 
                        name="jam" 
                        type="time"
                        value={form.jam} 
                        onChange={handleChange} 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                      <input 
                        name="tanggal" 
                        type="date" 
                        value={form.tanggal} 
                        onChange={handleChange} 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        required 
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50" 
                    disabled={loading}
                  >
                    {loading ? 'Menyimpan...' : 'Add Session'}
                  </button>
                  {error && <div className="text-red-600 text-sm">{error}</div>}
                </form>

                <h3 className="text-lg font-semibold mb-3">Daftar Session</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Judul</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Mata Pelajaran</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Kelas</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Guru</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Sesi</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Waktu Mulai</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Waktu Selesai</th>
                        <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jadwal.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-4 text-gray-500">Belum ada session</td>
                        </tr>
                      ) : (
                        jadwal.map((s) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-4 py-2">{s.title}</td>
                            <td className="border border-gray-300 px-4 py-2">{s.course_name}</td>
                            <td className="border border-gray-300 px-4 py-2">{s.class_name}</td>
                            <td className="border border-gray-300 px-4 py-2">{s.teacher_name || '-'}</td>
                            <td className="border border-gray-300 px-4 py-2">{s.session_number}</td>
                            <td className="border border-gray-300 px-4 py-2">{formatDateTime(s.start_time)}</td>
                            <td className="border border-gray-300 px-4 py-2">{formatDateTime(s.end_time)}</td>
                            <td className="border border-gray-300 px-4 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                s.is_completed 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {s.is_completed ? 'Selesai' : 'Belum Selesai'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'Schedule' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Add Schedule</h2>
                <p className="text-gray-600 mb-4">Fitur untuk menambah jadwal akan ditambahkan di sini.</p>
                {/* Form untuk schedule akan ditambahkan nanti */}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 