// hooks/useAuthGuard.ts
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useAuthGuard(role?: string) {
  const router = useRouter();

  useEffect(() => {
    const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!userData) {
      router.replace('/login');
      return;
    }
    const user = JSON.parse(userData);
    if (role && user.role !== role) {
      router.replace('/login');
      return;
    }
  }, [router, role]);
}