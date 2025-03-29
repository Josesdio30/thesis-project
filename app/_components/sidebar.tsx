'use client'

import { JSX, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  FaTachometerAlt, FaCalendarAlt, FaBook, 
  FaClipboardCheck, FaChartBar, FaComments 
} from "react-icons/fa";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  return (
    <div
      className={`h-screen bg-gray-800 text-white p-4 flex flex-col items-center transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      }`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="flex flex-col items-center mb-6">
        <div
          className={`rounded-full bg-gray-600 transition-all duration-300 ${
            isOpen ? "w-16 h-16" : "w-10 h-10"
          }`}
        ></div>
        {isOpen && <h2 className="mt-2 text-sm font-semibold">Nama Siswa</h2>}
      </div>

      <nav className="w-full space-y-4">
        <SidebarItem icon={<FaTachometerAlt />} text="Dashboard" isOpen={isOpen} path="/dashboard" router={router} />
        <SidebarItem icon={<FaCalendarAlt />} text="Schedule" isOpen={isOpen} path="/schedule" router={router} />
        <SidebarItem icon={<FaBook />} text="Assignment" isOpen={isOpen} path="/assignment" router={router} />
        <SidebarItem icon={<FaClipboardCheck />} text="Exam" isOpen={isOpen} path="/exam" router={router} />
        <SidebarItem icon={<FaChartBar />} text="Score" isOpen={isOpen} path="/score" router={router} />
        <SidebarItem icon={<FaComments />} text="Forum" isOpen={isOpen} path="/forum" router={router} />
      </nav>
    </div>
  );
};

const SidebarItem = ({ icon, text, isOpen, path, router }: { icon: JSX.Element; text: string; isOpen: boolean; path: string; router: any }) => {
  return (
    <div 
      className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer w-full"
      onClick={() => router.push(path)}
    >
      <span className="text-xl">{icon}</span>
      {isOpen && <span className="text-sm">{text}</span>}
    </div>
  );
};

export default Sidebar;
