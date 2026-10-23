'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  FaTachometerAlt,
  FaCalendarAlt,
  FaBook,
  FaClipboardCheck,
  FaChartBar,
  FaComments,
  FaUniversity,
  FaBullhorn,
  FaSignOutAlt,
  FaTimes,
  FaUsers,
  FaRobot,
} from 'react-icons/fa';
import { NAVIGATION_ITEMS, ADMIN_NAVIGATION_ITEMS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { signOut, useSession } from 'next-auth/react';

const iconMap = {
  FaTachometerAlt: FaTachometerAlt,
  FaCalendarAlt: FaCalendarAlt,
  FaBook: FaBook,
  FaClipboardCheck: FaClipboardCheck,
  FaChartBar: FaChartBar,
  FaComments: FaComments,
  FaUniversity: FaUniversity,
  FaBullhorn: FaBullhorn,
  FaUsers: FaUsers,
  FaRobot: FaRobot,
} as const;

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
}

interface SidebarItemProps {
  icon: React.ReactNode;
  text: string;
  path: string;
  isActive?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon, text, path, isActive, onClick }: SidebarItemProps) => {
  const router = useRouter();

  const handleClick = () => {
    router.push(path);
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg transition-all duration-200 w-full text-left',
        'hover:bg-gray-700 hover:scale-105',
        isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-300 hover:text-white'
      )}
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <span className="text-sm font-medium truncate">{text}</span>
    </button>
  );
};

const UserProfile = ({ userName, userRole }: { userName: string | null; userRole: string | null }) => (
  <div className="flex flex-col items-center mb-8 p-4 bg-gray-700 rounded-lg">
    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-3">
      <span className="text-white font-bold text-lg">{userName ? userName.charAt(0).toUpperCase() : 'U'}</span>
    </div>
    <h2 className="text-sm font-semibold text-white text-center">{userName || 'User'}</h2>
    {userRole && (
      <span className="text-xs text-gray-300 bg-gray-600 px-2 py-1 rounded-full mt-1 capitalize">
        {userRole.toLowerCase()}
      </span>
    )}
  </div>
);

const SidebarContent = ({
  userName,
  userRole,
  currentPath,
  onLogout,
  onItemClick,
}: {
  userName: string | null;
  userRole: string | null;
  currentPath: string;
  onLogout: () => void;
  onItemClick?: () => void;
}) => {
  // Pilih navigation items berdasarkan role
  const navigationItems = userRole?.toLowerCase() === 'admin' ? ADMIN_NAVIGATION_ITEMS : NAVIGATION_ITEMS;

  return (
    <div className="h-full flex flex-col">
      {/* User Profile */}
      <UserProfile userName={userName} userRole={userRole} />

      {/* Navigation Items */}
      <nav className="flex-1 space-y-2">
        {navigationItems.map(item => {
          const IconComponent = iconMap[item.icon as keyof typeof iconMap];
          const isActive = currentPath === item.path;

          return (
            <SidebarItem
              key={item.path}
              icon={<IconComponent />}
              text={item.text}
              path={item.path}
              isActive={isActive}
              onClick={onItemClick}
            />
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="mt-auto pt-4 border-t border-gray-600">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 p-3 rounded-lg transition-all duration-200 w-full text-left text-red-400 hover:text-red-300 hover:bg-red-900/20"
        >
          <FaSignOutAlt className="text-lg flex-shrink-0" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

const Sidebar = ({ isMobileOpen, setIsMobileOpen }: SidebarProps) => {
  const [userName, setUserName] = useState<string | null>(null);
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Prioritize session data over localStorage
    if (session?.user?.name) {
      setUserName(session.user.name);
    } else {
      // Fallback to localStorage if session is not available yet
      const storedName = localStorage.getItem('userName');
      if (storedName) setUserName(storedName);
    }
  }, [session]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  };

  const handleMobileItemClick = () => {
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Desktop Sidebar - FIXED */}
      <aside className="hidden md:block h-screen bg-gray-800 text-white md:w-56 lg:w-64 flex-shrink-0">
        <div className="p-4 h-full">
          <SidebarContent
            userName={userName}
            userRole={session?.user?.role || null}
            currentPath={pathname}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />

          {/* Sidebar - FIXED */}
          <aside className="relative bg-gray-800 text-white w-72 h-full shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded z-10"
            >
              <FaTimes className="text-lg" />
            </button>

            <div className="p-4 h-full">
              <SidebarContent
                userName={userName}
                userRole={session?.user?.role || null}
                currentPath={pathname}
                onLogout={handleLogout}
                onItemClick={handleMobileItemClick}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
