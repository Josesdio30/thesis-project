'use client';

import Sidebar from '../_components/sidebar';
import Link from 'next/link';
import { useState } from 'react';

export default function AnnouncementPage() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
          <Link
            href="/dashboard"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
          >
            ⬅
          </Link>
          <h1 className="text-2xl font-bold">Announcement</h1>
          <div></div>
        </div>

        <div className="bg-white p-6 rounded-md shadow">
          <p className="text-gray-600">Announcement page - Coming soon</p>
        </div>
      </div>
    </div>
  );
}
