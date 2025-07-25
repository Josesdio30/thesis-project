// 'use client';

// import Sidebar from '../_components/sidebar';
// import Link from 'next/link';
// import { useState } from 'react';

// export default function AssignmentPage() {
//   const [isMobileOpen, setIsMobileOpen] = useState(false);

//   return (
//     <div className="flex min-h-screen bg-gray-100">
//       <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />
//       <div className="flex-1 p-6">
//         <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
//           <Link
//             href="/dashboard"
//             className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
//           >
//             ⬅
//           </Link>
//           <h1 className="text-2xl font-bold">Assignment</h1>
//           <div></div>
//         </div>

//         <div className="bg-white p-6 rounded-md shadow">
//           <p className="text-gray-600">Assignment page - Coming soon</p>
//         </div>
//       </div>
//     </div>
//   );
// }

// new

'use client';

import Sidebar from '../_components/sidebar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Data dummy assignment
const assignments = [
  {
    id: 1,
    courseName: 'BIOLOGI',
    courseCode: 'BIO6713004',
    className: 'X-MIPA',
    courseType: 'Core Courses',
    done: true,
  },
  {
    id: 2,
    courseName: 'FISIKA',
    courseCode: 'FIS6713005',
    className: 'X-MIPA',
    courseType: 'Core Courses',
    done: true,
  },
  {
    id: 3,
    courseName: 'MATEMATIKA',
    courseCode: 'MTK6713006',
    className: 'X-MIPA',
    courseType: 'Elective',
    done: true,
  },
];

export default function AssignmentPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const unfinished = assignments.filter(a => !a.done).length;

  const handleCardClick = (courseCode: string) => {
    router.push(`/course/${courseCode}?tab=Assignment`);
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
          <Link
            href="/dashboard"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-200"
          >
            ⬅
          </Link>
          <h1 className="text-2xl font-bold">Assignment</h1>
          <div></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {assignments.map(a => (
            <div
              key={a.id}
              onClick={() => handleCardClick(a.courseCode)}
              className={`relative bg-white p-6 rounded-md shadow border transition hover:shadow-lg group cursor-pointer ${
                a.done ? 'opacity-80' : ''
              }`}
            >
              <div className="font-bold text-lg mb-1">{a.courseName}</div>
              <div className="text-gray-600 flex items-center mb-1">
                <span className="mr-2">Kode:</span> <span className="font-mono">{a.courseCode}</span>
              </div>
              <div className="text-gray-600 flex items-center mb-4">
                <span className="mr-2">Kelas:</span> <span>{a.className}</span>
              </div>
              {/* Hover: tampilkan course type */}
              <div className="absolute left-0 right-0 bottom-0 px-6 py-2 bg-gray-800 text-white text-sm rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Course type: <span className="font-semibold">{a.courseType}</span>
              </div>
              {/* Status selesai */}
              {a.done ? (
                <div className="text-green-600 font-semibold mt-2">Selesai</div>
              ) : (
                <div className="text-red-600 font-semibold mt-2">Belum Selesai</div>
              )}
            </div>
          ))}
        </div>

        {/* Status global */}
        {unfinished === 0 ? (
          <div className="text-green-600 font-bold text-lg text-center">All Done</div>
        ) : (
          <div className="text-red-600 font-bold text-lg text-center">Sisa {unfinished} assignment</div>
        )}
      </div>
    </div>
  );
}
