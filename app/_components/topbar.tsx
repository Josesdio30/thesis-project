"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { useState } from "react";

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const [showNotif, setShowNotif] = useState(false);

  // Dummy notifications
  const notifications = [
    { id: 1, message: "You have a new message." },
    { id: 2, message: "Assignment deadline approaching." },
    { id: 3, message: "Your course has been updated." },
  ];

  const pathTitleMap: Record<string, string> = {
    "/dashboard": "MY DASHBOARD",
    "/course": "MY COURSE",
    "/forum": "MY FORUM",
    "/session": "MY SESSION",
    "/schedule": "MY SCHEDULE",
  };

  const pageTitle = pathTitleMap[pathname] || "MY PAGE";

  return (
    <div className="w-full h-14 bg-white flex items-center justify-between px-4 border-b shadow-sm">
      {/* Left side */}
      <div className="flex items-center space-x-4">
        {/* Mobile Burger Button */}
        <button className="md:hidden" onClick={onMenuClick}>
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
        <div className="hidden md:flex items-center space-x-2">
          <Image src="/st_louis-2.png" alt="Logo" width={250} height={250} className="object-contain" />
          <span className="text-gray-500 mx-2">|</span>
          <span className="text-sm text-gray-700 font-bold">{pageTitle}</span>
        </div>
      </div>
      {/* Right side - Notification */}
      <div className="flex items-center space-x-6 relative">
        <div className="relative">
          <Bell
            className="w-6 h-6 text-gray-600 cursor-pointer"
            onClick={() => setShowNotif(!showNotif)}
          />
          {notifications.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {notifications.length}
            </span>
          )}

          {/* Notification Popup */}
          {showNotif && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 shadow-lg rounded-md z-10">
              <div className="p-3 text-sm font-semibold border-b">Notifications</div>
              {notifications.length > 0 ? (
                <ul className="max-h-60 overflow-y-auto">
                  {notifications.map((notif) => (
                    <li
                      key={notif.id}
                      className="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    >
                      {notif.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
