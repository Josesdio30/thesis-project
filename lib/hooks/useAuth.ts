'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const logout = useCallback(async () => {
    await signOut({
      redirect: true,
      callbackUrl: '/login',
    });
  }, []);

  const refreshSession = useCallback(async () => {
    // Force session refresh
    const event = new Event('visibilitychange');
    document.dispatchEvent(event);
  }, []);

  return {
    session,
    status,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    user: session?.user,
    logout,
    refreshSession,
  };
}
