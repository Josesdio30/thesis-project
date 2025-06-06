'use client'

import { useEffect } from "react";
import { JSX, useState } from "react";
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

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) {
      setUserName(storedName);
    }
  }, []);
  const handleLogout = () => {
    localStorage.removeItem("userName"); // clear stored name on logout
    router.push("/login");
  };

  return (
    <div
      className={`h-screen bg-gray-800 text-white p-4 flex flex-col items-center justify-between transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      }`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="flex flex-col items-center w-full">
        <div className="flex flex-col items-center mb-6">
          <div
            className={`rounded-full bg-gray-600 transition-all duration-300 ${
              isOpen ? "w-16 h-16" : "w-10 h-10"
            }`}
          ></div>
          {isOpen && <h2 className="mt-2 text-sm font-semibold">{userName || "Nama Siswa"}</h2>}
        </div>
        <nav className="w-full space-y-4">
          {NAVIGATION_ITEMS.map((item) => {
            const IconComponent = iconMap[item.icon as keyof typeof iconMap];
            return (
              <SidebarItem 
                key={item.path}
                icon={<IconComponent />} 
                text={item.text} 
                isOpen={isOpen} 
                path={item.path} 
                router={router} 
              />
            );
          })}
        </nav>
      </div>

      <div className="w-full">
        <SidebarItem 
          icon={<FaSignOutAlt />} 
          text="Logout" 
          isOpen={isOpen} 
          path="/login" 
          router={router} 
          onClick={handleLogout}
        />
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, text, isOpen, path, router, onClick }: { icon: JSX.Element; text: string; isOpen: boolean; path: string; router: any; onClick?: () => void }) => {
  return (
    <div 
      className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer w-full"
      onClick={() => onClick ? onClick() : router.push(path)}
    >
      <span className="text-xl">{icon}</span>
      {isOpen && <span className="text-sm">{text}</span>}
    </div>
  );
};

export default Sidebar;
