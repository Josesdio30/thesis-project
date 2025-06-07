'use client';

import React, { useState } from 'react';
import { FaClock, FaUser } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import Sidebar from '../_components/sidebar';
import { useRouter } from 'next/navigation';
import Topbar from '../_components/topbar';
import { Calendar } from '@/components/ui/calendar';

const dummySchedule: Record<string, { subject: string; teacher: string; time: string }[]> = {
  '2025-06-01': [
    { subject: 'Bahasa Inggris', teacher: 'Benedictus Dhaniar Ardra', time: '08:00 - 09:30' },
    { subject: 'Matematika', teacher: 'Johanna Dian Natalis', time: '09:30 - 11:00' },
  ],
  '2025-06-02': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-06-03': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-06-04': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-06-05': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-06-08': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-06-09': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-07-09': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-07-06': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
  '2025-07-03': [
    { subject: 'Sejarah', teacher: 'Ika Kristianningsih', time: '08:00 - 09:30' },
    { subject: 'Fisika', teacher: 'Caecilia Tjahjanti', time: '09:30 - 11:00' },
  ],
};

const formatDate = (date: Date | undefined): string => {
  return date ? format(date, 'yyyy-MM-dd') : '';
};

// const Schedule = () => {
//   const router = useRouter();
//   const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

//   const formattedDate = formatDate(selectedDate);
//   const schedule = dummySchedule[formattedDate as keyof typeof dummySchedule] || [];
//   const formattedHeaderDate = selectedDate ? format(selectedDate, 'MMM d, yyyy') : '';

//   const handleDateSelect = (date: Date | undefined) => {
//     if (date) setSelectedDate(date);
//   };

//   const datesWithSchedule = Object.keys(dummySchedule).map(dateStr => new Date(dateStr));

//   return (
//     <div className="flex min-h-screen">
//       <div className="hidden md:block md:w-64 lg:w-72 flex-shrink-0">
//         <Sidebar
//           isMobileOpen={false}
//           setIsMobileOpen={function (val: boolean): void {
//             throw new Error('Function not implemented.');
//           }}
//         />
//       </div>
//       <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0">
//         <Topbar
//           onMenuClick={function (): void {
//             throw new Error('Function not implemented.');
//           }}
//         />

//         {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
//           <Card className="md:col-span-2">
//             <CardHeader>
//               <CardTitle className="text-gray-900">My Schedule ({formattedHeaderDate})</CardTitle>
//             </CardHeader>
//             <CardContent>
//               {schedule.length > 0 ? (
//                 schedule.map((item, index) => (
//                   <Card key={index} className="mb-2 border border-gray-300 shadow-sm">
//                     <CardContent className="p-4">
//                       <p className="font-bold text-lg text-gray-900">{item.subject}</p>
//                       <p className="text-sm text-gray-700 flex items-center gap-2">
//                         <FaUser /> {item.teacher}
//                       </p>
//                       <p className="text-xs text-gray-600 flex items-center gap-2 mt-2">
//                         <FaClock /> {item.time}
//                       </p>
//                     </CardContent>
//                   </Card>
//                 ))
//               ) : (
//                 <div className="text-gray-800">
//                   <div className="font-semibold mb-1">There is no activity schedule</div>
//                   <div>
//                     It seems you do not have any activity schedule for{' '}
//                     {selectedDate ? format(selectedDate, 'MMM dd') : ''}
//                   </div>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//           <Card>
//             <CardHeader>
//               <CardTitle className="text-gray-900">Calendar</CardTitle>
//             </CardHeader>
//             <div className="flex justify-center items-center">
//               <CardContent>
//                 <Calendar
//                   mode="single"
//                   selected={selectedDate}
//                   onSelect={handleDateSelect}
//                   className="rounded-md border shadow-sm"
//                   captionLayout="dropdown"
//                   modifiers={{
//                     hasSchedule: datesWithSchedule,
//                   }}
//                   modifiersClassNames={{
//                     hasSchedule: 'has-schedule',
//                   }}
//                 />
//               </CardContent>
//             </div>
//           </Card>
//         </div> */}

//         <div className="grid grid-cols-1 gap-6 pt-8">
//           <Card>
//             <CardHeader>
//               <CardTitle className="text-gray-900">My Schedule ({formattedHeaderDate})</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <div className="flex flex-col lg:flex-row gap-6">
//                 {/* Schedule Section - Full width on mobile, left side on desktop */}
//                 <div className="flex-1">
//                   {schedule.length > 0 ? (
//                     schedule.map((item, index) => (
//                       <Card key={index} className="mb-2 border border-gray-300 shadow-sm">
//                         <CardContent className="p-4">
//                           <p className="font-bold text-lg text-gray-900">{item.subject}</p>
//                           <p className="text-sm text-gray-700 flex items-center gap-2">
//                             <FaUser /> {item.teacher}
//                           </p>
//                           <p className="text-xs text-gray-600 flex items-center gap-2 mt-2">
//                             <FaClock /> {item.time}
//                           </p>
//                         </CardContent>
//                       </Card>
//                     ))
//                   ) : (
//                     <div className="text-gray-800 text-center lg:text-left">
//                       <div className="font-semibold mb-1">There is no activity schedule</div>
//                       <div>
//                         It seems you do not have any activity schedule for{' '}
//                         {selectedDate ? format(selectedDate, 'MMM dd') : ''}
//                       </div>
//                     </div>
//                   )}
//                 </div>

//                 {/* Calendar Section - Right side */}
//                 <div className="flex justify-center lg:justify-end items-start">
//                   <Calendar
//                     mode="single"
//                     selected={selectedDate}
//                     onSelect={handleDateSelect}
//                     className="rounded-md border shadow-sm bg-white"
//                     captionLayout="dropdown"
//                     modifiers={{
//                       hasSchedule: datesWithSchedule,
//                     }}
//                     modifiersClassNames={{
//                       hasSchedule: 'has-schedule',
//                     }}
//                   />
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </div>
//   );
// };

const Schedule = () => {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const formattedDate = formatDate(selectedDate);
  const schedule = dummySchedule[formattedDate as keyof typeof dummySchedule] || [];
  const formattedHeaderDate = selectedDate ? format(selectedDate, 'MMM d, yyyy') : '';

  const handleDateSelect = (date: Date | undefined) => {
    if (date) setSelectedDate(date);
  };

  const handleMenuClick = () => {
    setIsMobileOpen(true);
  };

  const datesWithSchedule = Object.keys(dummySchedule).map(dateStr => new Date(dateStr));

  return (
    <div className="flex min-h-screen">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="p-3 sm:p-4 md:p-6 bg-gray-100 flex-1 min-w-0">
        <Topbar onMenuClick={handleMenuClick} />

        <div className="grid grid-cols-1 gap-6 pt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-900">My Schedule ({formattedHeaderDate})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Schedule Section - Full width on mobile, left side on desktop */}
                <div className="flex-1">
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
                    <div className="text-gray-800 text-center lg:text-left">
                      <div className="font-semibold mb-1">There is no activity schedule</div>
                      <div>
                        It seems you do not have any activity schedule for{' '}
                        {selectedDate ? format(selectedDate, 'MMM dd') : ''}
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
