'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user.role === 'ADMIN') router.push('/admin');
        else router.push('/dashboard');
      } else {
        setError(data.message || 'Login gagal');
      }
    } catch (err) {
      setError('Terjadi kesalahan saat login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Image
            src="/st_louis-2.png"
            alt="SMA St. Louis Surabaya Logo"
            width={150}
            height={150}
            className="object-contain"
          />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border-gray-300 rounded-md px-2 py-1"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border-gray-300 rounded-md px-2 py-1"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-orange-400 hover:bg-orange-600 text-white rounded-full py-2"
          >
            {isLoading ? 'Signing in...' : 'Login'}
          </button>
        </form>
        <div className="mt-4 text-sm text-gray-500">
          <div>Admin: admin / admin123</div>
          <div>Guru: guru / guru123</div>
          <div>Student: student / student123</div>
        </div>
      </div>
    </div>
  );
}
