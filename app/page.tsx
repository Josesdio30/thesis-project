// app/page.tsx
'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function HomePage() {
  useAuthGuard();

  return null;
}