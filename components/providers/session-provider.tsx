'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function AuthSessionProvider({ children }: Props) {
  return (
    <SessionProvider
      refetchOnWindowFocus={true} // Check when window gets focus
      refetchWhenOffline={false} // Don't refetch when offline
      refetchInterval={5 * 60} // Refetch every 5 minutes
    >
      {children}
    </SessionProvider>
  );
}
