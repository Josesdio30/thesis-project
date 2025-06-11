'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function HomePage() {
  const status = useAuthGuard();

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return <div> </div>;
}