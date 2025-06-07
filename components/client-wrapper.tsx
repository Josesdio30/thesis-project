'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export default function ClientWrapper({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={30} // Check session setiap 30 detik
      refetchOnWindowFocus={true}
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  );
}
