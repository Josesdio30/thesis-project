"use client";

import React, { useState } from "react";
import { FaClock, FaUser } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, Transition } from "@headlessui/react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import Sidebar from "../_components/sidebar";
import { useRouter } from "next/navigation";

const dummySchedule: Record<string, { subject: string; teacher: string; time: string }[]> = {
  "2025-02-01": [
    { subject: "Bahasa Inggris", teacher: "Benedictus Dhaniar Ardra", time: "08:00 - 09:30" },
    { subject: "Matematika", teacher: "Johanna Dian Natalis", time: "09:30 - 11:00" },
  ],
  "2025-02-02": [
    { subject: "Sejarah", teacher: "Ika Kristianningsih", time: "08:00 - 09:30" },
    { subject: "Fisika", teacher: "Caecilia Tjahjanti", time: "09:30 - 11:00" },
  ],
};

const formatDate = (date: Date | undefined): string => {
  return date ? format(date, "yyyy-MM-dd") : "";
};

const Schedule = () => {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date("2025-02-01"));
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date("2025-02-01"));

  const formattedDate = formatDate(selectedDate);
  const schedule = dummySchedule[formattedDate as keyof typeof dummySchedule] || [];
  const formattedHeaderDate = selectedDate ? format(selectedDate, "MMM d, yyyy") : "";

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth),
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="p-6 bg-gray-100 flex-1">
        <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
          >
            ⬅
          </button>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <div></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-gray-900">My Schedule ({formattedHeaderDate})</CardTitle>
            </CardHeader>
            <CardContent>
              {schedule.length > 0 ? (
                schedule.map((item, index) => (
                  <Card key={index} className="mb-2 border border-gray-300 shadow-sm">
                    <CardContent className="p-4">
                      <p className="font-bold text-lg text-gray-900">{item.subject}</p>
                      <p className="text-sm text-gray-700 flex items-center gap-2">
                        <FaUser /> {item.teacher}
                      </p>
                      <p className="text-xs text-gray-600 flex items-center gap-2 mt-2">
                        <FaClock /> {item.time}
                      </p>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-gray-800">No schedule available for this date.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover className="relative">
                <Popover.Button className="flex items-center gap-2 px-4 py-2 border text-gray-600 border-gray-300 rounded-md bg-white shadow-sm">
                  <CalendarIcon className="w-5 h-5 text-gray-500" />
                  {format(selectedMonth, "MMMM yyyy")}
                </Popover.Button>

                <Transition
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Popover.Panel className="absolute z-10 mt-2 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-gray-500">
                    <div className="flex justify-between items-center mb-3">
                      <Button variant="ghost" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <span className="text-lg font-bold">{format(selectedMonth, "MMMM yyyy")}</span>
                      <Button variant="ghost" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-gray-700">
                      {daysInMonth.map((date, i) => {
                        const isSelected = formatDate(selectedDate) === formatDate(date);

                        return (
                          <button
                            key={i}
                            className={`p-2 rounded-md transition-all ${
                              isSelected ? "border border-blue-500 bg-blue-100 text-blue-600 font-bold" : ""
                            } hover:border hover:border-gray-400`}
                            onClick={() => setSelectedDate(date)}
                          >
                            {format(date, "d")}
                          </button>
                        );
                      })}
                    </div>
                  </Popover.Panel>
                </Transition>
              </Popover>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
