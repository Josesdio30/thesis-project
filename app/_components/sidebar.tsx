'use client';

import { JSX, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaTachometerAlt, FaCalendarAlt, FaBook,
  FaClipboardCheck, FaChartBar, FaComments, FaUniversity,
  FaSignOutAlt
} from "react-icons/fa";
import { NAVIGATION_ITEMS } from "@/lib/constants";

const iconMap = {
  FaTachometerAlt: FaTachometerAlt,
  FaCalendarAlt: FaCalendarAlt,
  FaBook: FaBook,
  FaClipboardCheck: FaClipboardCheck,
  FaChartBar: FaChartBar,
  FaComments: FaComments,
  FaUniversity: FaUniversity,
};

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
}

const Sidebar = ({ isMobileOpen, setIsMobileOpen }: SidebarProps) => {
  const [userName, setUserName] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) setUserName(storedName);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("userName");
    router.push("/login");
  };

  // Sidebar Item Renderer
  const renderSidebarContent = () => (
    <div className="h-full flex flex-col justify-between">
      <div className="flex flex-col items-center">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-full bg-gray-600 w-16 h-16"></div>
          <h2 className="mt-2 text-sm font-semibold">{userName || "Nama Siswa"}</h2>
        </div>
        <nav className="w-full space-y-4">
          {NAVIGATION_ITEMS.map((item) => {
            const IconComponent = iconMap[item.icon as keyof typeof iconMap];
            return (
              <SidebarItem
                key={item.path}
                icon={<IconComponent />}
                text={item.text}
                path={item.path}
                router={router}
                onClick={() => setIsMobileOpen(false)}
              />
            );
          })}
        </nav>
      </div>
      <div className="w-full">
        <SidebarItem
          icon={<FaSignOutAlt />}
          text="Logout"
          path="/login"
          router={router}
          onClick={() => {
            handleLogout();
            setIsMobileOpen(false);
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-screen bg-gray-800 text-white w-64 p-4">
        {renderSidebarContent()}
      </div>

      {/* Mobile Sidebar Drawer */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        >
          <div
            className="bg-gray-800 text-white w-64 h-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  );
};

const SidebarItem = ({
  icon,
  text,
  path,
  router,
  onClick,
}: {
  icon: JSX.Element;
  text: string;
  path: string;
  router: any;
  onClick?: () => void;
}) => {
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer w-full"
      onClick={() => {
        if (onClick) onClick();
        router.push(path);
      }}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm">{text}</span>
    </div>
  );
};

export default Sidebar;
