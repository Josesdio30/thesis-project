'use client';

import Link from "next/link";
import Sidebar from "../_components/sidebar";
import { useEffect, useState } from "react";
import Footer from "@/components/common/footer";
import Topbar from "../_components/topbar";
import { Menu } from "lucide-react";

const Course = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        setCourses(data.data || []);
      } catch (err) {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
      <div className="flex flex-col flex-1 bg-gray-100">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 p-8">
          {/* <div className="flex justify-between items-center bg-gray-800 text-white p-2 rounded-md mb-6">
            <h1 className="text-xl font-bold">Course</h1>
            <div></div>
          </div> */}
          <div className="p-6 grid grid-cols-3 gap-6">
            {loading ? (
              <p>Loading...</p>
            ) : courses.length === 0 ? (
              <p>Tidak ada course.</p>
            ) : (
              courses.map((course, index) => (
                <Link
                  key={course.id || index}
                  href={{
                    pathname: `/course/${course.course_code}`,
                    query: { code: course.course_code },
                  }}
                  className="bg-gray-200 p-4 rounded-lg shadow-md border hover:bg-gray-300 transition-colors text-left block"
                >
                  <h2 className="font-semibold">{course.course_name}</h2>
                  <p className="text-sm text-gray-700">Kode: {course.course_code}</p>
                  <p className="text-sm text-gray-700">{course.description}</p>
                </Link>
              ))
            )}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default Course;