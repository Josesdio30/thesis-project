'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Sidebar from '../../_components/sidebar';
import Topbar from '../../_components/topbar';
import ConfigTab from './_components/ConfigTab';
import CredentialsTab from './_components/CredentialsTab';
import AccessControlTab from './_components/AccessControlTab';
import AuditTab from './_components/AuditTab';

const TABS = [
  { id: 'config', label: 'AI Config' },
  { id: 'credentials', label: 'API Credentials' },
  { id: 'access', label: 'Access Control' },
  { id: 'audit', label: 'AI Audit' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AiManagementPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isAdmin = session?.user?.role?.toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (!isAdmin) {
      router.replace('/dashboard');
    }
  }, [status, isAdmin, router]);

  if (status === 'loading' || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
      <div className="flex-1 bg-gray-50 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">AI Management</h1>

            {/* In-page menu bar */}
            <div className="flex flex-wrap gap-1 bg-white rounded-lg p-1 mb-6 shadow-sm">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[120px] py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'config' && <ConfigTab />}
            {activeTab === 'credentials' && <CredentialsTab />}
            {activeTab === 'access' && <AccessControlTab />}
            {activeTab === 'audit' && <AuditTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
