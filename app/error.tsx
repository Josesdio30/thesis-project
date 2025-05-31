'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-red-600 mb-4">Oops!</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">
          Terjadi Kesalahan
        </h2>
        <p className="text-gray-600 mb-8">
          Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi.
        </p>
        <div className="space-x-4">
          <button
            onClick={reset}
            className="bg-red-600 text-white px-6 py-3 rounded-md hover:bg-red-700 transition-colors"
          >
            Coba Lagi
          </button>
          <Link
            href="/dashboard"
            className="bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 transition-colors inline-block"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
