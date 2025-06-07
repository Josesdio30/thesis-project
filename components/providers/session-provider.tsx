'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Props {
  children: ReactNode;
}

// Component untuk handle auth guard di semua page
function AuthGuard({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);

  // Public routes yang tidak perlu authentication
  const publicRoutes = ['/login', '/(auth)/login'];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (status === 'unauthenticated' && !isPublicRoute) {
      console.log('User not authenticated, redirecting to login');
      setIsNavigating(true);
      router.push('/login');
      return;
    }

    if (status === 'authenticated' && isPublicRoute) {
      console.log('User authenticated, redirecting to dashboard');
      setIsNavigating(true);
      router.push('/dashboard');
      return;
    }

    setIsNavigating(false);
  }, [status, router, pathname, isPublicRoute]);

  // Show loading while checking auth status or navigating
  if (status === 'loading' || isNavigating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Show nothing for unauthenticated users on protected routes (will redirect)
  if (status === 'unauthenticated' && !isPublicRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Show nothing for authenticated users on public routes (will redirect)
  if (status === 'authenticated' && isPublicRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AuthSessionProvider({ children }: Props) {
  return (
    <SessionProvider
      refetchOnWindowFocus={true} // Check saat window focus
      refetchWhenOffline={false}
    >
      <AuthGuard>{children}</AuthGuard>
    </SessionProvider>
  );
}
