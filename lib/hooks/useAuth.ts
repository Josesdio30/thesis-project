'use client';

import { useRouter } from 'next/navigation';

export function useAuth() {
  const router = useRouter();

  // Ambil user dari localStorage
  const getUser = () => {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  };

  // Fungsi logout
  const logout = () => {
    localStorage.removeItem('user');
    router.replace('/login');
  };

  return {
    user: getUser(),
    logout,
  };
}
