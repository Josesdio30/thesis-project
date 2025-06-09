'use client';

import React, { useState, useEffect } from 'react';
import { FaClock, FaUser, FaGraduationCap, FaSpinner } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import Sidebar from '../_components/sidebar';
import { useRouter } from 'next/navigation';
import Topbar from '../_components/topbar';
import { Calendar } from '@/components/ui/calendar';
import { useSchedule } from '@/hooks';
import type { ScheduleItem } from '@/hooks/useSchedule';

const formatDate = (date: Date | undefined): string => {
  return date ? format(date, 'yyyy-MM-dd') : '';
};

const Schedule = () => {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Use the schedule hook
  const { scheduleData, loading, error, fetchDateSchedule } = useSchedule();

  // Get schedule for selected date
  const [dailySchedule, setDailySchedule] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    if (selectedDate && scheduleData) {
      const formattedDate = formatDate(selectedDate);

      // If scheduleData.schedule is grouped by date
      if (typeof scheduleData.schedule === 'object' && !Array.isArray(scheduleData.schedule)) {
        const schedule = scheduleData.schedule[formattedDate] || [];
        setDailySchedule(schedule);
      } else if (Array.isArray(scheduleData.schedule)) {
        // If scheduleData.schedule is a single date's schedule
        setDailySchedule(scheduleData.schedule);
      }
    }
  }, [selectedDate, scheduleData]);

  const formattedHeaderDate = selectedDate ? format(selectedDate, 'MMM d, yyyy') : '';

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      fetchDateSchedule(date);
    }
  };

  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  // Get dates with schedule for calendar highlighting
  const datesWithSchedule = scheduleData?.dates_with_schedule?.map(dateStr => new Date(dateStr)) || [];

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0 overflow-y-auto">
        <Topbar onMenuClick={handleMenuClick} />

        <div className="grid grid-cols-1 gap-6 pt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <FaGraduationCap className="text-blue-600" />
                My Schedule ({formattedHeaderDate})
                {scheduleData?.user_role && (
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full capitalize">
                    {scheduleData.user_role}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Schedule Section - Full width on mobile, left side on desktop */}
                <div className="flex-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <FaSpinner className="animate-spin text-blue-500 mr-2" />
                      <span className="text-gray-600">Loading schedule...</span>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <div className="text-red-600 font-semibold mb-2">Error loading schedule</div>
                      <div className="text-gray-600 mb-4">{error}</div>
                      <Button onClick={() => fetchDateSchedule(selectedDate || new Date())}>Try Again</Button>
                    </div>
                  ) : dailySchedule.length > 0 ? (
                    dailySchedule.map((item, index) => (
                      <Card
                        key={index}
                        className="mb-2 border border-gray-300 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-bold text-lg text-gray-900">{item.subject}</p>
                            {item.course_code && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                {item.course_code}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-700 flex items-center gap-2 mb-1">
                            <FaUser className="text-blue-500" /> {item.teacher}
                          </p>

                          <p className="text-xs text-gray-600 flex items-center gap-2 mb-2">
                            <FaClock className="text-green-500" /> {item.time}
                          </p>

                          {item.session_title && (
                            <p className="text-sm text-gray-800 font-medium mb-1">
                              Session {item.session_number}: {item.session_title}
                            </p>
                          )}

                          {item.description && <p className="text-xs text-gray-600 mt-2">{item.description}</p>}

                          <div className="flex justify-between items-center mt-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  item.is_completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {item.is_completed ? 'Completed' : 'Scheduled'}
                              </span>
                            </div>

                            {item.course_code && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/course/${item.course_code}`)}
                              >
                                View Course
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-gray-800 text-center lg:text-left py-12">
                      <div className="font-semibold mb-2">No scheduled activities</div>
                      <div className="text-gray-600">
                        You don't have any scheduled activities for{' '}
                        {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'this date'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Calendar Section - Right side */}
                <div className="flex justify-center lg:justify-end items-start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    className="rounded-md border shadow-sm bg-white"
                    captionLayout="dropdown"
                    modifiers={{
                      hasSchedule: datesWithSchedule,
                    }}
                    modifiersClassNames={{
                      hasSchedule: 'has-schedule',
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
