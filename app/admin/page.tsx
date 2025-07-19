import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

const AdminDashboard = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({
    kodeGuru: '',
    kodeSiswa: '',
    kodeMapel: '',
    jam: '',
    tanggal: '',
  });
  const [jadwal, setJadwal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || session?.user.role !== 'ADMIN') {
      router.replace('/login');
    }
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setJadwal((prev) => [...prev, data.session]);
      setForm({ kodeGuru: '', kodeSiswa: '', kodeMapel: '', jam: '', tanggal: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch jadwal (dummy, nanti bisa diisi dari backend)
  useEffect(() => {
    const fetchJadwal = async () => {
      try {
        const res = await fetch('/api/admin/session');
        const data = await res.json();
        if (data.success) setJadwal(data.sessions);
      } catch {}
    };
    fetchJadwal();
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4 border p-4 rounded mb-8 bg-white shadow">
        <div>
          <label className="block mb-1">Kode Guru</label>
          <input name="kodeGuru" value={form.kodeGuru} onChange={handleChange} className="border rounded px-2 py-1 w-full" required />
        </div>
        <div>
          <label className="block mb-1">Kode Siswa</label>
          <input name="kodeSiswa" value={form.kodeSiswa} onChange={handleChange} className="border rounded px-2 py-1 w-full" required />
        </div>
        <div>
          <label className="block mb-1">Kode Mata Pelajaran</label>
          <input name="kodeMapel" value={form.kodeMapel} onChange={handleChange} className="border rounded px-2 py-1 w-full" required />
        </div>
        <div>
          <label className="block mb-1">Jam</label>
          <input name="jam" value={form.jam} onChange={handleChange} className="border rounded px-2 py-1 w-full" required />
        </div>
        <div>
          <label className="block mb-1">Tanggal</label>
          <input name="tanggal" type="date" value={form.tanggal} onChange={handleChange} className="border rounded px-2 py-1 w-full" required />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
          {loading ? 'Menyimpan...' : 'Input Session'}
        </button>
        {error && <div className="text-red-600">{error}</div>}
      </form>
      <h2 className="text-xl font-semibold mb-2">Jadwal Session</h2>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1">Kode Guru</th>
            <th className="border px-2 py-1">Kode Siswa</th>
            <th className="border px-2 py-1">Kode Mapel</th>
            <th className="border px-2 py-1">Jam</th>
            <th className="border px-2 py-1">Tanggal</th>
          </tr>
        </thead>
        <tbody>
          {jadwal.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-2">Belum ada session</td></tr>
          ) : (
            jadwal.map((s, i) => (
              <tr key={i}>
                <td className="border px-2 py-1">{s.kodeGuru}</td>
                <td className="border px-2 py-1">{s.kodeSiswa}</td>
                <td className="border px-2 py-1">{s.kodeMapel}</td>
                <td className="border px-2 py-1">{s.jam}</td>
                <td className="border px-2 py-1">{s.tanggal}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminDashboard; 